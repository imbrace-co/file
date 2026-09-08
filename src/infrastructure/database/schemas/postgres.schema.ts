import {
  pgTable,
  uuid,
  varchar,
  bigint,
  timestamp,
  pgEnum,
  text,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * PostgreSQL-specific schema
 * Drizzle ORM v1.0.0-beta.2
 */

// Storage type enum - PostgreSQL specific
export const storageTypeEnum = pgEnum("storage_type", ["s3", "local"]);

// File metadata table for PostgreSQL
export const files = pgTable("files", {
  id: uuid().primaryKey().defaultRandom(),
  filename: varchar({ length: 500 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  size: bigint({ mode: "number" }).notNull(),
  storageType: storageTypeEnum().notNull(),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
});

// TypeScript types inferred from schema
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

// Financial Files table
export const financialFiles = pgTable(
  "financial_files",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    file_name: varchar("file_name", { length: 255 }).notNull(),
    original_url: text("original_url").notNull(),
    updated_link: text("updated_link"),
    organization_id: varchar("organization_id", { length: 255 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("financial_files_org_idx").on(table.organization_id)],
);

export type FinancialFile = typeof financialFiles.$inferSelect;
export type NewFinancialFile = typeof financialFiles.$inferInsert;
