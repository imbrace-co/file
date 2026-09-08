import { MongoClient, Db, Collection, ObjectId, Document } from "mongodb";
import {
  DatabaseClient,
  WhereClause,
  SelectOptions,
  FindOptions,
  FileRecord,
  NewFileRecord,
} from "../types";
import config from "../../../config";
import logger from "../../logging/logger";

/**
 * MongoDB Adapter that implements the same interface as Drizzle ORM
 * This allows the repository layer to use the same API regardless of database type
 */
class MongoDBAdapter implements DatabaseClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    try {
      if (!config.database.connectionString) {
        throw new Error("MongoDB connection string is required");
      }

      this.client = new MongoClient(config.database.connectionString);
      await this.client.connect();

      // Get database name from connection string or config
      const dbName = config.database.database || "fileservice";
      this.db = this.client.db(dbName);

      logger.info("MongoDB connected successfully via adapter");
    } catch (error) {
      logger.error("MongoDB connection error:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info("MongoDB disconnected");
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  private getCollection(tableName: string): Collection {
    if (!this.db) {
      throw new Error("MongoDB not connected. Call connect() first.");
    }
    return this.db.collection(tableName);
  }

  private convertWhereClause(where: WhereClause<any>): Document {
    if (!where) return {};

    // If it's already a MongoDB filter, return as-is
    if (typeof where === "object" && !Array.isArray(where)) {
      const filter: Document = {};

      // Convert field names and handle special cases
      for (const [key, value] of Object.entries(where)) {
        // Handle ID field specially - convert string to ObjectId if needed
        if (key === "id") {
          if (typeof value === "string") {
            filter["_id"] = new ObjectId(value);
          } else if (value instanceof ObjectId) {
            filter["_id"] = value;
          } else {
            filter["_id"] = value;
          }
        } else {
          filter[key] = value;
        }
      }

      return filter;
    }

    return {};
  }

  private convertToFileRecord(doc: Document): FileRecord {
    return {
      id: doc._id.toString(),
      filename: doc.filename,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      size: doc.size,
      storageType: doc.storageType,
      storagePath: doc.storagePath,
      uploadedAt: doc.uploadedAt,
      updatedAt: doc.updatedAt,
    };
  }

  async select<T>(options: SelectOptions<T>): Promise<T[]> {
    const collection = this.getCollection(options.from);

    const filter = options.where ? this.convertWhereClause(options.where) : {};

    let cursor = collection.find(filter);

    // Apply ordering
    if (options.orderBy && options.orderBy.length > 0) {
      const sort: Document = {};
      options.orderBy.forEach((order) => {
        sort[order.field] = order.direction === "asc" ? 1 : -1;
      });
      cursor = cursor.sort(sort);
    }

    // Apply pagination
    if (options.offset) {
      cursor = cursor.skip(options.offset);
    }
    if (options.limit) {
      cursor = cursor.limit(options.limit);
    }

    const docs = await cursor.toArray();
    return docs.map((doc) => this.convertToFileRecord(doc) as T);
  }

  async insert<T>(table: string, data: T | T[]): Promise<T[]> {
    const collection = this.getCollection(table);
    const dataArray = Array.isArray(data) ? data : [data];

    // Prepare documents for insertion
    const docs = dataArray.map((item) => {
      const doc = { ...item } as any;

      // Remove id field if present (MongoDB will generate _id)
      if ("id" in doc) {
        delete doc.id;
      }

      // Add timestamps if not present
      if (!doc.uploadedAt) {
        doc.uploadedAt = new Date();
      }
      if (!doc.updatedAt) {
        doc.updatedAt = new Date();
      }

      return doc;
    });

    if (docs.length === 1) {
      const result = await collection.insertOne(docs[0]);
      const inserted = await collection.findOne({ _id: result.insertedId });
      return [this.convertToFileRecord(inserted!) as T];
    } else {
      const result = await collection.insertMany(docs);
      const ids = Object.values(result.insertedIds);
      const inserted = await collection.find({ _id: { $in: ids } }).toArray();
      return inserted.map((doc) => this.convertToFileRecord(doc) as T);
    }
  }

  async update<T>(
    table: string,
    where: WhereClause<T>,
    data: Partial<T>
  ): Promise<T[]> {
    const collection = this.getCollection(table);
    const filter = this.convertWhereClause(where);

    const updateDoc: Document = { ...data };

    // Remove id field if present (can't update _id)
    if ("id" in updateDoc) {
      delete updateDoc.id;
    }

    // Update the updatedAt timestamp
    updateDoc.updatedAt = new Date();

    // Update all matching documents
    const result = await collection.updateMany(filter, { $set: updateDoc });

    // Fetch and return updated documents
    const updated = await collection.find(filter).toArray();
    return updated.map((doc) => this.convertToFileRecord(doc) as T);
  }

  async delete<T>(table: string, where: WhereClause<T>): Promise<number> {
    const collection = this.getCollection(table);
    const filter = this.convertWhereClause(where);

    const result = await collection.deleteMany(filter);
    return result.deletedCount;
  }

  async findFirst<T>(table: string, where: WhereClause<T>): Promise<T | null> {
    const collection = this.getCollection(table);
    const filter = this.convertWhereClause(where);

    const doc = await collection.findOne(filter);
    if (!doc) return null;

    return this.convertToFileRecord(doc) as T;
  }

  async findMany<T>(
    table: string,
    where?: WhereClause<T>,
    options?: FindOptions
  ): Promise<T[]> {
    const collection = this.getCollection(table);
    const filter = where ? this.convertWhereClause(where) : {};

    let cursor = collection.find(filter);

    // Apply ordering
    if (options?.orderBy && options.orderBy.length > 0) {
      const sort: Document = {};
      options.orderBy.forEach((order) => {
        sort[order.field] = order.direction === "asc" ? 1 : -1;
      });
      cursor = cursor.sort(sort);
    }

    // Apply pagination
    if (options?.offset) {
      cursor = cursor.skip(options.offset);
    }
    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    const docs = await cursor.toArray();
    return docs.map((doc) => this.convertToFileRecord(doc) as T);
  }
}

let adapter: MongoDBAdapter | null = null;

export const connectMongoDB = async (): Promise<void> => {
  adapter = new MongoDBAdapter();
  await adapter.connect();
};

export const disconnectMongoDB = async (): Promise<void> => {
  if (adapter) {
    await adapter.disconnect();
    adapter = null;
  }
};

export const getMongoDBAdapter = (): MongoDBAdapter => {
  if (!adapter) {
    throw new Error(
      "MongoDB adapter not initialized. Call connectMongoDB() first."
    );
  }
  return adapter;
};

export const isConnected = (): boolean => {
  return adapter ? adapter.isConnected() : false;
};

export default {
  connect: connectMongoDB,
  disconnect: disconnectMongoDB,
  getAdapter: getMongoDBAdapter,
  isConnected,
};
