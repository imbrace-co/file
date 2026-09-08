import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { Pool as PgPool } from "pg";
import mysql from "mysql2/promise";
import Database from "better-sqlite3";
import config from "../../../config";
import logger from "../../logging/logger";

/**
 * Multi-dialect Drizzle ORM client
 * Supports PostgreSQL, MySQL, and SQLite
 * Drizzle ORM v1.0.0-beta.2
 */

let db: any = null;
let connection: PgPool | mysql.Pool | Database.Database | null = null;

export const connectDrizzle = async (): Promise<void> => {
  try {
    const dbType = config.database.type;

    if (dbType === "mongodb") {
      throw new Error("Use MongoDB adapter for MongoDB connections");
    }

    logger.info(`Connecting to ${dbType} database...`);

    // Dynamically load the appropriate schema
    const schema = await import("../schemas/" + dbType + ".schema");

    switch (dbType) {
      case "postgres": {
        // PostgreSQL connection
        const poolConfig: any = {
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        };

        if (config.database.connectionString) {
          poolConfig.connectionString = config.database.connectionString;
        } else {
          poolConfig.host = config.database.host;
          poolConfig.port = config.database.port;
          poolConfig.database = config.database.database;
          poolConfig.user = config.database.user;
          poolConfig.password = config.database.password;
        }

        const pool = new PgPool(poolConfig);

        // Test connection
        const client = await pool.connect();
        client.release();

        connection = pool;
        db = drizzlePostgres({ client: pool, schema });
        break;
      }

      case "mysql": {
        // MySQL connection
        const poolConfig: any = {
          connectionLimit: 10,
        };

        if (config.database.connectionString) {
          poolConfig.uri = config.database.connectionString;
        } else {
          poolConfig.host = config.database.host;
          poolConfig.port = config.database.port;
          poolConfig.database = config.database.database;
          poolConfig.user = config.database.user;
          poolConfig.password = config.database.password;
        }

        const pool = mysql.createPool(
          config.database.connectionString
            ? config.database.connectionString
            : poolConfig
        );

        // Test connection
        await pool.query("SELECT 1");

        connection = pool;
        db = drizzleMysql({ client: pool, schema, mode: "default" });
        break;
      }

      case "sqlite": {
        // SQLite connection
        const sqlitePath =
          config.database.connectionString || "./data/fileservice.db";

        // Ensure directory exists
        const fs = await import("fs");
        const path = await import("path");
        const dir = path.dirname(sqlitePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const sqlite = new Database(sqlitePath);
        connection = sqlite;
        db = drizzleSqlite({ client: sqlite, schema });
        break;
      }

      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }

    logger.info(
      `${dbType.toUpperCase()} connected successfully via Drizzle ORM v1.0.0-beta.2`
    );
  } catch (error) {
    logger.error("Database connection error:", error);
    throw error;
  }
};

export const disconnectDrizzle = async (): Promise<void> => {
  const dbType = config.database.type;

  if (connection) {
    switch (dbType) {
      case "postgres":
        await (connection as PgPool).end();
        break;
      case "mysql":
        await (connection as mysql.Pool).end();
        break;
      case "sqlite":
        (connection as Database.Database).close();
        break;
    }
    connection = null;
    db = null;
    logger.info(`${dbType.toUpperCase()} disconnected`);
  }
};

export const getDrizzleClient = () => {
  if (!db) {
    throw new Error(
      "Drizzle client not initialized. Call connectDrizzle() first."
    );
  }
  return db;
};

export const isConnected = (): boolean => {
  return db !== null && connection !== null;
};

export default {
  connect: connectDrizzle,
  disconnect: disconnectDrizzle,
  getClient: getDrizzleClient,
  isConnected,
};
