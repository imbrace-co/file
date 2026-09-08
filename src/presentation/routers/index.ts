import { Hono } from "hono";
import { healthCheck } from "../controllers/health.controller";
import { ValidationError } from "../../domain/shared/errors";
import fileRouter from "./file.router";
import v1Router from "./v1.router";

/**
 * Main API router for Hono
 */
const apiRouter = new Hono();

// Health check
apiRouter.get("/health", healthCheck);

// Test error route
apiRouter.get("/error", (c) => {
  throw new ValidationError("This is a test validation error");
});

// Legacy file routes (preserved for backward compatibility)
apiRouter.route("/files", fileRouter);

// v1 spec routes — all file-related APIs from the backend
apiRouter.route("/v1", v1Router);

export default apiRouter;
