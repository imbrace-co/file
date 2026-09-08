import { Context } from "hono";
import { AppError } from "../../domain/shared/errors";
import logger from "../../infrastructure/logging/logger";

/**
 * Error handler middleware for Hono
 * Handles all errors thrown in the application
 */
export const errorHandler = async (err: Error, c: Context) => {
  let statusCode = 500;
  let message = "Internal server error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log error
  logger.error(`${err.name}: ${err.message}`, {
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
  });

  // Don't leak error details in production. Accept both the legacy
  // "development" and the standardized "dev" env value.
  const env = process.env.NODE_ENV;
  const isDevelopment = env === "development" || env === "dev";

  return c.json(
    {
      success: false,
      error: {
        message,
        ...(isDevelopment && { stack: err.stack }),
      },
    },
    statusCode as any
  );
};
