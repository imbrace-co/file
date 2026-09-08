import { DatabaseClient } from "./types";
import drizzleDB from "./adapters/drizzle.adapter";
import mongoDB from "./adapters/mongodb.adapter";
import config from "../../config";
import logger from "../logging/logger";

let dbClient: DatabaseClient | null = null;

/**
 * Database factory that returns the appropriate database client based on configuration
 * Supports: MongoDB, PostgreSQL, MySQL, SQLite
 */
export const initializeDatabase = async (): Promise<DatabaseClient> => {
  const dbType = config.database.type;

  logger.info(`Initializing database: ${dbType}`);

  switch (dbType) {
    case "mongodb":
      await mongoDB.connect();
      dbClient = mongoDB.getAdapter();
      break;

    case "postgres":
    case "mysql":
    case "sqlite":
      await drizzleDB.connect();
      // Wrap Drizzle client to match DatabaseClient interface
      dbClient = await createDrizzleAdapter();
      break;

    default:
      throw new Error(`Unknown database type: ${dbType}`);
  }

  logger.info(`Database initialized successfully: ${dbType}`);
  return dbClient;
};

export const getDatabase = (): DatabaseClient => {
  if (!dbClient) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return dbClient;
};

export const disconnectDatabase = async (): Promise<void> => {
  const dbType = config.database.type;

  switch (dbType) {
    case "mongodb":
      await mongoDB.disconnect();
      break;
    case "postgres":
    case "mysql":
    case "sqlite":
      await drizzleDB.disconnect();
      break;
  }

  dbClient = null;
  logger.info("Database disconnected");
};

export const isDatabaseConnected = (): boolean => {
  const dbType = config.database.type;

  switch (dbType) {
    case "mongodb":
      return mongoDB.isConnected();
    case "postgres":
    case "mysql":
    case "sqlite":
      return drizzleDB.isConnected();
    default:
      return false;
  }
};

/**
 * Adapter to wrap Drizzle client and make it conform to DatabaseClient interface
 * Works with any SQL database (PostgreSQL, MySQL, SQLite)
 */
async function createDrizzleAdapter(): Promise<DatabaseClient> {
  const drizzle = drizzleDB.getClient();
  const dbType = config.database.type;

  // Dynamically load the schema for the current database type
  let schema: any;
  switch (dbType) {
    case "postgres":
      schema = await import("./schemas/postgres.schema");
      break;
    case "mysql":
      schema = await import("./schemas/mysql.schema");
      break;
    case "sqlite":
      schema = await import("./schemas/sqlite.schema");
      break;
    default:
      throw new Error(`Unsupported database type for Drizzle: ${dbType}`);
  }

  const { files } = schema;

  return {
    async select(options) {
      let query = drizzle.select().from(files);

      if (options.where) {
        query = query.where(options.where as any);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.offset(options.offset);
      }

      return await query;
    },

    async insert(table, data) {
      const dataArray = Array.isArray(data) ? data : [data];
      const result = await drizzle
        .insert(files)
        .values(dataArray as any)
        .returning();
      return result as any;
    },

    async update(table, where, data) {
      const result = await drizzle
        .update(files)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(where as any)
        .returning();
      return result as any;
    },

    async delete(table, where) {
      const result = await drizzle
        .delete(files)
        .where(where as any)
        .returning();
      return result.length;
    },

    async findFirst(table, where) {
      const result = await drizzle
        .select()
        .from(files)
        .where(where as any)
        .limit(1);
      return result[0] || null;
    },

    async findMany(table, where, options) {
      let query = drizzle.select().from(files);

      if (where) {
        query = query.where(where as any);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      return await query;
    },

    async connect() {
      await drizzleDB.connect();
    },

    async disconnect() {
      await drizzleDB.disconnect();
    },

    isConnected() {
      return drizzleDB.isConnected();
    },
  };
}

export default {
  initialize: initializeDatabase,
  getDatabase,
  disconnect: disconnectDatabase,
  isConnected: isDatabaseConnected,
};
