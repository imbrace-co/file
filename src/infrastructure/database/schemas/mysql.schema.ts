import {
  mysqlTable,
  varchar,
  bigint,
  timestamp,
  text,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * MySQL-specific schema
 * Drizzle ORM v1.0.0-beta.2
 */

// File metadata table for MySQL
export const files = mysqlTable("files", {
  id: varchar({ length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  filename: varchar({ length: 500 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  size: bigint({ mode: "number" }).notNull(),
  storageType: varchar("storage_type", {
    length: 10,
    enum: ["s3", "local"],
  }).notNull(),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => sql`CURRENT_TIMESTAMP`),
});

// TypeScript types inferred from schema
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

// Financial Files table
export const financialFiles = mysqlTable("financial_files", {
  id: varchar("id", { length: 36 }).primaryKey(),
  file_name: varchar("file_name", { length: 255 }).notNull(),
  original_url: text("original_url").notNull(),
  updated_link: text("updated_link"),
  organization_id: varchar("organization_id", { length: 255 }).notNull(),
  created_at: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => sql`CURRENT_TIMESTAMP`),
});

export type FinancialFile = typeof financialFiles.$inferSelect;
export type NewFinancialFile = typeof financialFiles.$inferInsert;
