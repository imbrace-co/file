import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit Configuration
 * Supports PostgreSQL, MySQL, and SQLite via DB_TYPE env var
 */

const dbType = (process.env.DB_TYPE || "postgres") as
  | "postgres"
  | "mysql"
  | "sqlite";

// Schema mapping — points to actual schema files
const schemaMap = {
  postgres: "./src/infrastructure/database/schemas/postgres.schema.ts",
  mysql: "./src/infrastructure/database/schemas/mysql.schema.ts",
  sqlite: "./src/infrastructure/database/schemas/sqlite.schema.ts",
};

export default defineConfig({
  dialect: dbType === "postgres" ? "postgresql" : dbType,
  schema: schemaMap[dbType],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://localhost:5432/fileservice",
  } as any,
  verbose: true,
  strict: false,
});
