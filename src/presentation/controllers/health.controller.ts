import { Context } from "hono";
import { isDatabaseConnected } from "../../infrastructure/database/factory";
import logger from "../../infrastructure/logging/logger";
import { DatabaseError } from "../../domain/shared/errors";
import config from "../../config";

/**
 * Health check handler for Hono
 */
export const healthCheck = async (c: Context) => {
  try {
    logger.info("Health check requested");

    const dbConnected = isDatabaseConnected();
    const dbStatus = dbConnected ? "connected" : "disconnected";

    if (!dbConnected) {
      throw new DatabaseError("Database is not connected");
    }

    logger.info(`Database status: ${dbStatus}`);

    return c.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      version: config.version,
      services: {
        database: dbStatus,
        databaseType: config.database.type,
        storageType: config.storage.type,
      },
    });
  } catch (error) {
    logger.error("Health check error:", error);
    throw error;
  }
};
