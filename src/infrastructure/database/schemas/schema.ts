import config from "../config";

/**
 * Dynamic schema loader
 * Loads the appropriate schema based on database type
 */

export const loadSchema = async () => {
  const dbType = config.database.type;

  switch (dbType) {
    case "postgres":
      return await import("./schema.postgres");
    case "mysql":
      return await import("./schema.mysql");
    case "sqlite":
      return await import("./schema.sqlite");
    case "mongodb":
      // MongoDB doesn't use Drizzle schemas
      return null;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
};

// Re-export types (these will be the same across all dialects)
export type { File, NewFile } from "./schema.postgres";
