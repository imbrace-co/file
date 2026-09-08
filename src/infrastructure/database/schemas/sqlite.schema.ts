import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite-specific schema
 * Drizzle ORM v1.0.0-beta.2
 */

// File metadata table for SQLite
export const files = sqliteTable("files", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  filename: text().notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer({ mode: "number" }).notNull(),
  storageType: text("storage_type", { enum: ["s3", "local"] }).notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

// TypeScript types inferred from schema
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

// Financial Files table
export const financialFiles = sqliteTable("financial_files", {
  id: text("id").primaryKey(),
  file_name: text("file_name").notNull(),
  original_url: text("original_url").notNull(),
  updated_link: text("updated_link"),
  organization_id: text("organization_id").notNull(),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export type FinancialFile = typeof financialFiles.$inferSelect;
export type NewFinancialFile = typeof financialFiles.$inferInsert;
