import dotenv from "dotenv";
dotenv.config();

interface Config {
  port: number;
  environment: string;
  serviceBaseUrl: string;
  database: {
    type: "mongodb" | "postgres" | "mysql" | "sqlite";
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
  storage: {
    type: "s3" | "local";
    localPath?: string;
    s3?: {
      bucketName: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
      /**
       * When set (S3_URL env), the public file URL becomes
       * `${publicUrl}/${key}` instead of the default
       * `https://s3.${region}.amazonaws.com/${bucketName}/${key}`.
       * Trailing slash is trimmed.
       */
      publicUrl?: string;
    };
  };
  version: string;
  /** Base directory for local static file serving (FILE_PATH env) */
  filePath?: string;
  /** URL of the main backend service for proxying (BACKEND_URL env) */
  backendUrl?: string;
  /** JWT secret — optional, used for future signature verification */
  jwtSecret?: string;
}

function createConfig(): Config {
  const port = parseInt(process.env.PORT || "8866", 10);
  if (isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }

  // Determine database type
  const dbType = (process.env.DB_TYPE || "mongodb") as
    | "mongodb"
    | "postgres"
    | "mysql"
    | "sqlite";

  // Database configuration based on type
  const database: Config["database"] = {
    type: dbType,
  };

  if (dbType === "mongodb") {
    // Prefer MONGO_URI explicitly; fallback to DATABASE_URL only if it looks like a mongo URI
    const mongoUri =
      process.env.MONGO_URI ||
      (process.env.DATABASE_URL?.startsWith("mongodb")
        ? process.env.DATABASE_URL
        : undefined);
    if (!mongoUri) {
      throw new Error(
        "MONGO_URI or DATABASE_URL environment variable is required for MongoDB",
      );
    }
    database.connectionString = mongoUri;
    database.database = process.env.DB_NAME || "fileservice";
  } else if (dbType === "postgres" || dbType === "mysql") {
    if (process.env.DATABASE_URL) {
      database.connectionString = process.env.DATABASE_URL;
    }

    database.host = process.env.DB_HOST || "localhost";
    database.port = parseInt(
      process.env.DB_PORT || (dbType === "postgres" ? "5432" : "3306"),
      10,
    );
    database.database = process.env.DB_NAME || "fileservice";
    database.user = process.env.DB_USER;
    database.password = process.env.DB_PASSWORD;

    if (!database.connectionString && (!database.user || !database.password)) {
      throw new Error(
        `DB_USER and DB_PASSWORD are required for ${dbType} (or provide DATABASE_URL)`,
      );
    }
  } else if (dbType === "sqlite") {
    database.connectionString =
      process.env.DATABASE_URL ||
      process.env.DB_PATH ||
      "./data/fileservice.db";
  }

  // Storage configuration
  const localPath = process.env.LOCAL_PATH;
  const storage: Config["storage"] = {
    type: localPath ? "local" : "s3",
  };

  if (localPath) {
    storage.localPath = localPath;
  } else {
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const s3BucketName = process.env.S3_BUCKET_NAME;

    if (!awsAccessKeyId || !awsSecretAccessKey || !s3BucketName) {
      throw new Error(
        "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME are required when LOCAL_PATH is not set",
      );
    }

    storage.s3 = {
      bucketName: s3BucketName,
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: process.env.AWS_REGION || "us-east-1",
      publicUrl: process.env.S3_URL
        ? process.env.S3_URL.replace(/\/+$/, "")
        : undefined,
    };
  }

  return {
    port,
    environment: process.env.NODE_ENV || "development",
    database,
    storage,
    version: "2.0.0",
    filePath: process.env.FILE_PATH,
    backendUrl: process.env.BACKEND_URL,
    jwtSecret: process.env.JWT_SECRET,
    serviceBaseUrl:
      process.env.SERVICE_BASE_URL || `http://file-service:${port}`,
  };
}

const config = createConfig();

export default config;
