import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import config from "./config";
import { initializeDatabase } from "./infrastructure/database/factory";
import { initializeStorage } from "./infrastructure/storage/factory";
import apiRouter from "./presentation/routers";
import v1Router from "./presentation/routers/v1.router";
import { httpLogger } from "./presentation/middleware/logger.middleware";
import { requestContext } from "./presentation/middleware/request-context.middleware";
import { errorHandler } from "./presentation/middleware/errorHandler.middleware";
import logger from "./infrastructure/logging/logger";
import { installCorrelation } from "./infrastructure/http/client";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDrizzleClient } from "./infrastructure/database/adapters/drizzle.adapter";

async function ensurePostgresDatabase(): Promise<void> {
  let host: string, port: number, user: string, password: string, database: string;
  let useSSL = process.env.POSTGRES_SSL === "true";

  if (config.database.connectionString) {
    const url = new URL(config.database.connectionString);
    host = url.hostname;
    port = parseInt(url.port || "5432");
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = url.pathname.slice(1);
    if (url.searchParams.get("sslmode") === "require") useSSL = true;
  } else {
    host = config.database.host || "localhost";
    port = config.database.port || 5432;
    user = config.database.user || "postgres";
    password = config.database.password || "";
    database = config.database.database || "file_service";
  }

  const ssl = useSSL ? { rejectUnauthorized: false } : undefined;
  const admin = new Pool({ host, port, user, password, database: "postgres", max: 1, ssl });
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${database}"`);
      logger.info(`[startup] created database "${database}"`);
    }
  } finally {
    await admin.end();
  }
}

const startServer = async () => {
  // Propagate x-request-id / x-proxy on every outbound fetch call.
  installCorrelation();

  try {
    // Initialize database (MongoDB, PostgreSQL, MySQL, or SQLite)
    // Only initialize if DB is needed (financial files feature requires it)
    const dbType = config.database.type;
    if (dbType !== "mongodb" || config.database.connectionString) {
      try {
        if (dbType === "postgres") await ensurePostgresDatabase();
        await initializeDatabase();
        if (dbType === "postgres") {
          await migrate(getDrizzleClient(), { migrationsFolder: "./drizzle" });
          logger.info("PostgreSQL migrations applied");
        }
        logger.info(`Database initialized: ${config.database.type}`);
      } catch (dbErr) {
        logger.warn(
          "Database initialization failed — financial files will be unavailable:",
          dbErr,
        );
      }
    }

    // Initialize storage (S3 or Local)
    initializeStorage();
    logger.info(`Storage initialized: ${config.storage.type}`);

    // Create Hono app
    const app = new Hono();

    // Middleware — requestContext first (correlation + propagation).
    app.use("*", requestContext);
    app.use("*", cors());
    app.use("*", httpLogger);

    // Root endpoint
    app.get("/", (c) => {
      return c.json({
        name: "File Service API",
        version: config.version,
        environment: config.environment,
        database: config.database.type,
        storage: config.storage.type,
      });
    });

    // API routes — mounted under /api for legacy compat
    app.route("/api", apiRouter);

    // v1 routes also mounted at root level for spec-exact paths (/v1/...)
    // This allows the FE to just switch the host without changing any paths
    app.route("/v1", v1Router);

    // Error handling
    app.onError(errorHandler);

    // Start server
    const port = config.port;

    logger.info(`Starting server on port ${port}...`);

    serve({
      fetch: app.fetch,
      port,
    });

    logger.info(`✨ Server running at http://localhost:${port}`);
    logger.info(`📊 Database: ${config.database.type}`);
    logger.info(`💾 Storage: ${config.storage.type}`);
  } catch (error) {
    logger.error("Server startup error:", error);
    process.exit(1);
  }
};

startServer();
