import { SQL } from "drizzle-orm";

// Database configuration types
export interface DatabaseConfig {
  type: "mongodb" | "postgres" | "mysql" | "sqlite";
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

// Generic query result
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// Where clause type
export type WhereClause<T> = Partial<T> | SQL;

// Base database client interface that both Drizzle and MongoDB adapter will implement
export interface DatabaseClient {
  // Query methods
  select<T>(options: SelectOptions<T>): Promise<T[]>;
  insert<T>(table: string, data: T | T[]): Promise<T[]>;
  update<T>(
    table: string,
    where: WhereClause<T>,
    data: Partial<T>
  ): Promise<T[]>;
  delete<T>(table: string, where: WhereClause<T>): Promise<number>;

  // Helper methods
  findFirst<T>(table: string, where: WhereClause<T>): Promise<T | null>;
  findMany<T>(
    table: string,
    where?: WhereClause<T>,
    options?: FindOptions
  ): Promise<T[]>;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

// Select options
export interface SelectOptions<T> {
  from: string;
  where?: WhereClause<T>;
  limit?: number;
  offset?: number;
  orderBy?: OrderByOption[];
}

// Find options
export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: OrderByOption[];
}

// Order by option
export interface OrderByOption {
  field: string;
  direction: "asc" | "desc";
}

// File record types (matches schema)
export interface FileRecord {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  storageType: "s3" | "local";
  storagePath: string;
  uploadedAt: Date;
  updatedAt: Date;
}

export interface NewFileRecord {
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  storageType: "s3" | "local";
  storagePath: string;
}
