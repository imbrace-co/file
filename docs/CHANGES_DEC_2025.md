# File Service Architecture Documentation

## December 2025

This document explains the current architecture of the File Service, including how to work with Hono, Drizzle ORM, and multi-database support.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Hono Framework](#hono-framework)
5. [Database Layer](#database-layer)
6. [Storage Layer](#storage-layer)
7. [How to Change Database](#how-to-change-database)
8. [How to Modify the System](#how-to-modify-the-system)
9. [Environment Configuration](#environment-configuration)

---

## Architecture Overview

The File Service is built with a **layered architecture** following clean architecture principles:

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                      │
│         (Hono Routes, Controllers, Middleware)              │
│              - Handle HTTP requests/responses               │
│              - Parse and validate input                     │
│              - Format responses                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    Application Layer                        │
│                   (Service Layer)                           │
│              - Business logic & validation                  │
│              - Orchestrate infrastructure                   │
│              - Use cases implementation                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   Infrastructure Layer                      │
│    ┌─────────────────────────┬──────────────────────────┐   │
│    │    Database Layer       │    Storage Layer         │   │
│    │  (Drizzle/MongoDB)      │    (S3/Local FS)         │   │
│    │  - Adapters             │    - Adapters            │   │
│    │  - Repositories         │    - Factory             │   │
│    │  - Factory              │                          │   │
│    └─────────────────────────┴──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

```
HTTP Request
    ↓
Controller (Presentation)
    ↓ (calls service method)
Service (Application)
    ↓ (uses infrastructure)
Infrastructure (Database/Storage)
    ↓
Response
```

### Key Design Principles:

1. **Separation of Concerns**: Each layer has a distinct responsibility

   - **Controllers**: HTTP concerns only (request parsing, response formatting)
   - **Services**: Business logic and orchestration
   - **Infrastructure**: External systems (database, storage, logging)

2. **Adapter Pattern**: Database and storage adapters implement common interfaces

3. **Factory Pattern**: Database and storage instances are created via factories

4. **Dependency Injection**: Layers depend on abstractions, not concrete implementations

5. **Configuration-based**: Environment variables control which implementations are used

---

## Technology Stack

### Core Framework

- **[Hono.js](https://hono.dev/)**: Ultra-fast web framework (Express.js replacement)
  - Supports Node.js, Cloudflare Workers, Deno, Bun
  - TypeScript-first with excellent type inference
  - Middleware-based architecture

### Database

- **[Drizzle ORM](https://orm.drizzle.team/)**: TypeScript ORM for SQL databases
  - Supports PostgreSQL, MySQL, SQLite
  - Type-safe query builder
  - Schema-first approach
- **[MongoDB Native Driver](https://www.mongodb.com/docs/drivers/node/current/)**: For MongoDB support
  - Custom adapter wraps MongoDB API to match Drizzle interface

### Storage

- **AWS S3**: Cloud object storage
- **Local File System**: For development/testing

---

## Project Structure

```
src/
├── config/                          # Configuration management
│   └── index.ts                     # Centralized config from env vars
│
├── domain/                          # Domain layer (business entities)
│   └── shared/
│       └── errors.ts                # Custom error classes
│
├── application/                     # Application/Service layer
│   └── services/
│       └── file.service.ts          # File business logic
│
├── infrastructure/                  # Infrastructure layer
│   ├── database/
│   │   ├── adapters/                # Database adapters
│   │   │   ├── drizzle.adapter.ts   # Drizzle ORM adapter (SQL databases)
│   │   │   └── mongodb.adapter.ts   # MongoDB adapter
│   │   ├── repositories/            # Data access repositories
│   │   │   └── file.repository.ts   # File metadata repository
│   │   ├── schemas/                 # Database schemas
│   │   │   ├── postgres.schema.ts   # PostgreSQL schema
│   │   │   ├── mysql.schema.ts      # MySQL schema
│   │   │   └── sqlite.schema.ts     # SQLite schema
│   │   ├── factory.ts               # Database factory (creates adapters)
│   │   └── types.ts                 # Database type definitions
│   │
│   ├── storage/
│   │   ├── adapters/                # Storage adapters
│   │   │   ├── s3.adapter.ts        # AWS S3 storage
│   │   │   └── local.adapter.ts     # Local file system storage
│   │   ├── factory.ts               # Storage factory
│   │   └── types.ts                 # Storage type definitions
│   │
│   └── logging/
│       └── logger.ts                # Winston logger configuration
│
├── presentation/                    # Presentation layer
│   ├── controllers/                 # Request handlers (HTTP layer)
│   │   ├── file.controller.ts       # File operations controller
│   │   └── health.controller.ts     # Health check endpoint
│   ├── middleware/                  # HTTP middleware
│   │   ├── logger.middleware.ts     # HTTP request logging
│   │   └── errorHandler.middleware.ts # Global error handling
│   └── routers/                     # Route definitions
│       ├── file.router.ts           # File routes
│       └── index.ts                 # Main API router
│
└── index.ts                         # Application entry point
```

---

## Hono Framework

### What is Hono?

Hono is a modern, lightweight web framework designed for edge computing and serverless environments. It's a perfect replacement for Express.js with:

- **10x faster** than Express.js
- **Zero dependencies** (smaller bundle size)
- **Multi-runtime support** (Node.js, Cloudflare Workers, Deno, Bun)
- **Excellent TypeScript support** with automatic type inference

### How We Use Hono

#### 1. Application Setup (`src/index.ts`)

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", httpLogger);

// Routes
app.route("/api", apiRouter);

// Error handling
app.onError(errorHandler);

// Start server
serve({ fetch: app.fetch, port: 8866 });
```

#### 2. Route Definition (`src/presentation/routers/file.router.ts`)

```typescript
import { Hono } from "hono";

const fileRouter = new Hono();
const fileController = new FileController();

// Define routes
fileRouter.post("/upload", fileController.upload);
fileRouter.get("/download/:fileName", fileController.download);
fileRouter.post("/presigned-urls", fileController.generateBatchPresignedUrls);
```

#### 3. Controller Pattern (`src/presentation/controllers/file.controller.ts`)

```typescript
import { Context } from "hono";

class FileController {
  upload = async (c: Context) => {
    // Access request
    const body = await c.req.parseBody();
    const file = body["file"];

    // Access query params
    const param = c.req.query("paramName");

    // Return response
    return c.json({ message: "Success", data: result });
  };
}
```

#### 4. Middleware (`src/presentation/middleware/logger.middleware.ts`)

```typescript
import { Context, Next } from "hono";

export const httpLogger = async (c: Context, next: Next) => {
  const start = Date.now();
  await next(); // Call next middleware/handler
  const duration = Date.now() - start;
  logger.info(`${c.req.method} ${c.req.path} - ${duration}ms`);
};
```

#### 5. Error Handling (`src/presentation/middleware/errorHandler.middleware.ts`)

```typescript
import { Context } from "hono";

export const errorHandler = (err: Error, c: Context) => {
  // Custom error handling
  if (err instanceof ValidationError) {
    return c.json({ error: err.message }, 400);
  }
  return c.json({ error: "Internal server error" }, 500);
};
```

### Key Hono Concepts

| Concept         | Description                     | Example                        |
| --------------- | ------------------------------- | ------------------------------ |
| `Context (c)`   | Request/response context object | `c.req.query()`, `c.json()`    |
| `Next`          | Middleware chain continuation   | `await next()`                 |
| `app.use()`     | Register middleware             | `app.use("*", cors())`         |
| `app.route()`   | Mount sub-routers               | `app.route("/api", apiRouter)` |
| `app.onError()` | Global error handler            | `app.onError(errorHandler)`    |

---

## Service Layer (Application Layer)

### What is the Service Layer?

The **Service Layer** sits between the Presentation Layer (controllers) and the Infrastructure Layer (database, storage). It encapsulates:

- **Business logic and rules**
- **Data validation**
- **Infrastructure orchestration**
- **Use case implementations**

### Why Use a Service Layer?

**Before (Direct Infrastructure Access):**

```
Controller → Infrastructure (Storage/Database)
```

Problems:

- Business logic mixed with HTTP concerns
- Hard to test without HTTP context
- Difficult to reuse logic across different interfaces (REST, GraphQL, CLI)

**After (With Service Layer):**

```
Controller → Service → Infrastructure
```

Benefits:

- ✅ Clean separation of concerns
- ✅ Business logic independent of HTTP
- ✅ Easy to test (no HTTP mocking needed)
- ✅ Reusable across different interfaces
- ✅ Single source of truth for business rules

### Service Layer Structure

#### File Service (`src/application/services/file.service.ts`)

```typescript
import { getStorage } from "../../infrastructure/storage/factory";
import { fileRepository } from "../../infrastructure/database/repositories/file.repository";
import logger from "../../infrastructure/logging/logger";

class FileService {
  /**
   * Upload a file to storage
   */
  async uploadFile(dto: UploadFileDTO): Promise<UploadFileResponse> {
    const { buffer, filename, mimetype } = dto;

    try {
      // Business logic: Upload to storage
      const storage = getStorage();
      const result = await storage.upload(buffer, filename, mimetype);

      // Business logic: Save metadata (when enabled)
      // await fileRepository.createFileRecord({...});

      logger.info(`File uploaded successfully: ${filename}`);

      return {
        message: "File uploaded successfully",
        data: result,
        fileInfo: {
          originalName: filename,
          detectedMimeType: result.detectedMimeType,
          finalMimeType: result.finalMimeType,
          size: buffer.length,
        },
      };
    } catch (error) {
      logger.error("File upload service error:", error);
      throw error;
    }
  }

  /**
   * Generate batch presigned URLs
   */
  async generateBatchPresignedUrls(dto: GeneratePresignedUrlsDTO) {
    const { keys, expiresInMinutes, validateExistence } = dto;

    // Validation logic (business rules)
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      throw new Error("keys array is required and must not be empty");
    }

    if (keys.length > 100) {
      throw new Error("Maximum 100 keys allowed per request");
    }

    if (expiresInMinutes <= 0 || expiresInMinutes > 43200) {
      throw new Error("Expiration time must be between 1 minute and 30 days");
    }

    // Orchestrate infrastructure
    const storage = getStorage();
    const result = await storage.generateBatchPresignedUrls(
      keys,
      expiresInMinutes,
      validateExistence
    );

    logger.info(`Generated ${Object.keys(result.urls).length} presigned URLs`);

    return {
      urls: result.urls,
      expiresIn: `${expiresInMinutes} minutes`,
      validated: validateExistence,
      ...(validateExistence && { metadata: result.metadata }),
    };
  }
}

export const fileService = new FileService();
```

### Data Transfer Objects (DTOs)

DTOs define the contract between controllers and services:

```typescript
// Input DTO
export interface UploadFileDTO {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

// Output DTO
export interface UploadFileResponse {
  message: string;
  data: UploadResult;
  fileInfo: {
    originalName: string;
    detectedMimeType?: string;
    finalMimeType?: string;
    size: number;
  };
}
```

### Controller Using Service Layer

**Old Way (Direct Infrastructure Access):**

```typescript
class FileController {
  upload = async (c: Context) => {
    const body = await c.req.parseBody();
    const file = body["file"];

    // ❌ Business logic in controller
    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const result = await storage.upload(buffer, file.name, file.type);

    return c.json({ data: result });
  };
}
```

**New Way (Using Service Layer):**

```typescript
class FileController {
  upload = async (c: Context) => {
    try {
      // Parse HTTP request (HTTP concern)
      const body = await c.req.parseBody();
      const file = body["file"];

      if (!file || !(file instanceof File)) {
        return c.json({ error: "No file uploaded" }, 400);
      }

      // Prepare data for service
      const buffer = Buffer.from(await file.arrayBuffer());

      // ✅ Delegate to service layer (business logic)
      const result = await fileService.uploadFile({
        buffer,
        filename: file.name,
        mimetype: file.type,
      });

      // Return HTTP response (HTTP concern)
      return c.json(result);
    } catch (error) {
      logger.error("File upload controller error:", error);
      return c.json({ error: (error as Error).message }, 500);
    }
  };
}
```

### Available Service Methods

| Method                         | Purpose                          | Input                          | Output                          |
| ------------------------------ | -------------------------------- | ------------------------------ | ------------------------------- |
| `uploadFile()`                 | Upload a file to storage         | `UploadFileDTO`                | `UploadFileResponse`            |
| `downloadFile()`               | Download a file from storage     | `DownloadFileDTO`              | `DownloadResult`                |
| `deleteFile()`                 | Delete a file from storage       | `fileName: string`             | `void`                          |
| `generatePresignedUrl()`       | Generate single presigned URL    | `fileName`, `expiresInMinutes` | `string`                        |
| `generateBatchPresignedUrls()` | Generate multiple presigned URLs | `GeneratePresignedUrlsDTO`     | `GeneratePresignedUrlsResponse` |
| `listFiles()`                  | List files (when DB enabled)     | `limit`, `offset`              | `FileRecord[]`                  |
| `getFileById()`                | Get file metadata by ID          | `fileId: string`               | `FileRecord \| null`            |

### Testing with Service Layer

Services can be tested independently without HTTP context:

```typescript
import { fileService } from "../services/file.service";

describe("FileService", () => {
  it("should upload a file", async () => {
    const result = await fileService.uploadFile({
      buffer: Buffer.from("test content"),
      filename: "test.txt",
      mimetype: "text/plain",
    });

    expect(result.message).toBe("File uploaded successfully");
    expect(result.fileInfo.originalName).toBe("test.txt");
  });

  it("should validate presigned URL expiration", async () => {
    await expect(
      fileService.generateBatchPresignedUrls({
        keys: ["file1.txt"],
        expiresInMinutes: 0, // Invalid
        validateExistence: false,
      })
    ).rejects.toThrow("between 1 minute and 30 days");
  });
});
```

---

## Database Layer

### Multi-Database Support

The service supports **4 database types**:

1. **MongoDB** (NoSQL)
2. **PostgreSQL** (SQL)
3. **MySQL** (SQL)
4. **SQLite** (SQL)

### Architecture: The Adapter Pattern

To support multiple databases, we use the **Adapter Pattern** with a unified interface:

```typescript
// Common interface (src/infrastructure/database/types.ts)
export interface DatabaseClient {
  select<T>(options: SelectOptions<T>): Promise<T[]>;
  insert<T>(table: string, data: T | T[]): Promise<T[]>;
  update<T>(
    table: string,
    where: WhereClause<T>,
    data: Partial<T>
  ): Promise<T[]>;
  delete<T>(table: string, where: WhereClause<T>): Promise<number>;
  findFirst<T>(table: string, where: WhereClause<T>): Promise<T | null>;
  findMany<T>(
    table: string,
    where?: WhereClause<T>,
    options?: FindOptions
  ): Promise<T[]>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
```

Both **Drizzle** (for SQL) and **MongoDB** adapters implement this interface, allowing the rest of the application to work with any database transparently.

### Database Factory (`src/infrastructure/database/factory.ts`)

The factory selects the correct adapter based on configuration:

```typescript
export const initializeDatabase = async (): Promise<DatabaseClient> => {
  const dbType = config.database.type; // From environment variables

  switch (dbType) {
    case "mongodb":
      await mongoDB.connect();
      return mongoDB.getAdapter();

    case "postgres":
    case "mysql":
    case "sqlite":
      await drizzleDB.connect();
      return createDrizzleAdapter(); // Wraps Drizzle to match interface

    default:
      throw new Error(`Unknown database type: ${dbType}`);
  }
};
```

### Drizzle ORM (SQL Databases)

#### 1. Schema Definition (e.g., `schemas/postgres.schema.ts`)

```typescript
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: varchar("filename", { length: 500 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  size: integer("size").notNull(),
  storageType: varchar("storage_type", { length: 50 }).notNull(),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Each database type has its own schema file:

- `postgres.schema.ts` - Uses `pg-core` (PostgreSQL types)
- `mysql.schema.ts` - Uses `mysql-core` (MySQL types)
- `sqlite.schema.ts` - Uses `sqlite-core` (SQLite types)

#### 2. Drizzle Adapter (`adapters/drizzle.adapter.ts`)

```typescript
export const connectDrizzle = async (): Promise<void> => {
  const dbType = config.database.type;

  switch (dbType) {
    case "postgres":
      const { drizzle: pgDrizzle } = await import("drizzle-orm/node-postgres");
      const { Pool } = await import("pg");
      const pool = new Pool({
        /* connection config */
      });
      drizzleClient = pgDrizzle(pool);
      break;

    case "mysql":
      const { drizzle: mysqlDrizzle } = await import("drizzle-orm/mysql2");
      const mysql = await import("mysql2/promise");
      const connection = await mysql.createConnection({
        /* config */
      });
      drizzleClient = mysqlDrizzle(connection);
      break;

    case "sqlite":
      const { drizzle: sqliteDrizzle } = await import(
        "drizzle-orm/better-sqlite3"
      );
      const Database = await import("better-sqlite3");
      const sqlite = new Database.default(config.database.connectionString!);
      drizzleClient = sqliteDrizzle(sqlite);
      break;
  }
};
```

#### 3. Using Drizzle in Repositories

```typescript
import { eq } from "drizzle-orm";
import { files } from "../schemas/postgres.schema";

// Insert
await db.insert(files).values({ filename: "test.pdf", ... });

// Select with where clause
await db.select().from(files).where(eq(files.id, fileId));

// Update
await db.update(files)
  .set({ filename: "new-name.pdf" })
  .where(eq(files.id, fileId));

// Delete
await db.delete(files).where(eq(files.id, fileId));
```

### MongoDB Adapter

The MongoDB adapter wraps the native MongoDB driver to match the `DatabaseClient` interface:

```typescript
class MongoDBAdapter implements DatabaseClient {
  async insert<T>(table: string, data: T | T[]): Promise<T[]> {
    const collection = this.db.collection(table);
    const docs = Array.isArray(data) ? data : [data];

    // Transform: remove id, add timestamps
    const prepared = docs.map((item) => ({
      ...item,
      uploadedAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await collection.insertMany(prepared);
    const inserted = await collection
      .find({
        _id: { $in: Object.values(result.insertedIds) },
      })
      .toArray();

    return inserted.map((doc) => this.convertToFileRecord(doc));
  }

  async findFirst<T>(table: string, where: WhereClause<T>): Promise<T | null> {
    const collection = this.db.collection(table);
    const filter = this.convertWhereClause(where); // Converts id -> _id, etc.
    const doc = await collection.findOne(filter);
    return doc ? this.convertToFileRecord(doc) : null;
  }
}
```

### Repository Layer (`repositories/file.repository.ts`)

The repository pattern provides high-level data access methods:

```typescript
class FileRepository {
  async createFileRecord(data: NewFileRecord): Promise<FileRecord> {
    const db = getDatabase();
    const [file] = await db.insert("files", data);
    return file;
  }

  async getFileById(id: string): Promise<FileRecord | null> {
    const db = getDatabase();
    return await db.findFirst("files", { id });
  }

  async deleteFile(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete("files", { id });
  }
}

export const fileRepository = new FileRepository();
```

---

## Storage Layer

### Supported Storage Types

1. **AWS S3** - Cloud object storage
2. **Local File System** - For development/testing

### Storage Interface (`infrastructure/storage/types.ts`)

```typescript
export interface StorageAdapter {
  upload(
    buffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult>;
  delete(key: string): Promise<void>;
  generatePresignedUrl(key: string, expiresIn: number): Promise<string>;
  generateBatchPresignedUrls(
    keys: string[],
    expiresIn: number,
    validate: boolean
  ): Promise<BatchPresignedUrlResult>;
}
```

### S3 Adapter (`storage/adapters/s3.adapter.ts`)

```typescript
class S3Adapter implements StorageAdapter {
  private s3Client: S3Client;

  async upload(buffer: Buffer, filename: string, mimetype: string): Promise<UploadResult> {
    const key = `${Date.now()}-${filename}`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    }));

    return { key, location: `s3://${this.bucketName}/${key}`, ... };
  }

  async generatePresignedUrl(key: string, expiresIn: number): Promise<string> {
    return await getSignedUrl(this.s3Client, new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }), { expiresIn: expiresIn * 60 });
  }
}
```

### Local Adapter (`storage/adapters/local.adapter.ts`)

```typescript
class LocalAdapter implements StorageAdapter {
  async upload(buffer: Buffer, filename: string, mimetype: string): Promise<UploadResult> {
    const filepath = path.join(this.uploadDir, filename);
    await fs.promises.writeFile(filepath, buffer);
    return { key: filename, location: filepath, ... };
  }

  async download(key: string): Promise<DownloadResult> {
    const filepath = path.join(this.uploadDir, key);
    const buffer = await fs.promises.readFile(filepath);
    return { Body: buffer, ContentType: mime.lookup(key) };
  }
}
```

---

## How to Change Database

### Step 1: Set Environment Variable

Change the `DB_TYPE` environment variable in your `.env` file:

```bash
# For MongoDB
DB_TYPE=mongodb
MONGO_URI=mongodb://localhost:27017/fileservice

# For PostgreSQL
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fileservice
DB_USER=postgres
DB_PASSWORD=yourpassword

# For MySQL
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=fileservice
DB_USER=root
DB_PASSWORD=yourpassword

# For SQLite
DB_TYPE=sqlite
DB_PATH=./data/fileservice.db
```

### Step 2: Install Required Dependencies

```bash
# For PostgreSQL
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg

# For MySQL
pnpm add drizzle-orm mysql2
pnpm add -D drizzle-kit

# For SQLite
pnpm add drizzle-orm better-sqlite3
pnpm add -D drizzle-kit @types/better-sqlite3

# For MongoDB
pnpm add mongodb
```

### Step 3: Run Database Migrations (SQL databases only)

```bash
# Generate migration files
pnpm drizzle-kit generate:pg   # For PostgreSQL
pnpm drizzle-kit generate:mysql # For MySQL
pnpm drizzle-kit generate:sqlite # For SQLite

# Apply migrations
pnpm drizzle-kit push:pg       # For PostgreSQL
pnpm drizzle-kit push:mysql    # For MySQL
pnpm drizzle-kit push:sqlite   # For SQLite
```

For MongoDB, create collections manually or let the adapter create them automatically.

### Step 4: Restart the Server

```bash
pnpm run dev
```

The application will automatically use the correct database adapter based on `DB_TYPE`.

### Step 5: Verify

Check the startup logs:

```
✨ Initializing database: postgres
✨ Database initialized successfully: postgres
✨ Server running at http://localhost:8866
```

---

## How to Modify the System

### Adding a New Database Field

#### 1. Update the Schema

**For PostgreSQL (`schemas/postgres.schema.ts`):**

```typescript
export const files = pgTable("files", {
  // ... existing fields
  metadata: jsonb("metadata"), // NEW FIELD
});
```

**For MySQL (`schemas/mysql.schema.ts`):**

```typescript
export const files = mysqlTable("files", {
  // ... existing fields
  metadata: json("metadata"), // NEW FIELD
});
```

**For SQLite (`schemas/sqlite.schema.ts`):**

```typescript
export const files = sqliteTable("files", {
  // ... existing fields
  metadata: text("metadata", { mode: "json" }), // NEW FIELD
});
```

**For MongoDB:**

No schema change needed - MongoDB is schemaless. Just start using the field.

#### 2. Update TypeScript Types (`types.ts`)

```typescript
export interface FileRecord {
  // ... existing fields
  metadata?: Record<string, any>; // NEW FIELD
}

export interface NewFileRecord {
  // ... existing fields
  metadata?: Record<string, any>; // NEW FIELD
}
```

#### 3. Generate and Apply Migration (SQL only)

```bash
pnpm drizzle-kit generate:pg
pnpm drizzle-kit push:pg
```

#### 4. Update Repository Methods (if needed)

```typescript
async createFileRecord(data: NewFileRecord): Promise<FileRecord> {
  const db = getDatabase();
  const [file] = await db.insert("files", {
    ...data,
    metadata: data.metadata || {} // Handle new field
  });
  return file;
}
```

### Adding a New API Endpoint

#### 1. Add Controller Method (`controllers/file.controller.ts`)

```typescript
class FileController {
  listFiles = async (c: Context) => {
    try {
      const limit = parseInt(c.req.query("limit") || "10");
      const offset = parseInt(c.req.query("offset") || "0");

      const files = await fileRepository.listFiles(limit, offset);

      return c.json({ data: files, total: files.length });
    } catch (error) {
      logger.error("List files error:", error);
      return c.json({ error: (error as Error).message }, 500);
    }
  };
}
```

#### 2. Add Route (`routers/file.router.ts`)

```typescript
fileRouter.get("/list", fileController.listFiles);
```

#### 3. Add Repository Method (`repositories/file.repository.ts`)

```typescript
async listFiles(limit: number, offset: number): Promise<FileRecord[]> {
  const db = getDatabase();
  return await db.findMany("files", undefined, { limit, offset });
}
```

### Adding a New Database Type

#### 1. Create Schema File

Create `schemas/newdb.schema.ts` following the pattern of existing schemas.

#### 2. Update Drizzle Adapter

Add connection logic in `adapters/drizzle.adapter.ts`:

```typescript
export const connectDrizzle = async (): Promise<void> => {
  switch (dbType) {
    // ... existing cases
    case "newdb":
      const { drizzle: newdbDrizzle } = await import("drizzle-orm/newdb");
      const newdbDriver = await import("newdb-driver");
      // ... connection setup
      break;
  }
};
```

#### 3. Update Factory

Add case in `factory.ts`:

```typescript
switch (dbType) {
  // ... existing cases
  case "newdb":
    await drizzleDB.connect();
    return createDrizzleAdapter();
}
```

#### 4. Update Config Types

In `config/index.ts`:

```typescript
interface Config {
  database: {
    type: "mongodb" | "postgres" | "mysql" | "sqlite" | "newdb"; // Add here
    // ...
  };
}
```

### Adding a New Storage Provider

#### 1. Create Adapter

Create `storage/adapters/cloudflare-r2.adapter.ts`:

```typescript
class R2Adapter implements StorageAdapter {
  async upload(
    buffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<UploadResult> {
    // Implementation
  }
  // ... implement other methods
}
```

#### 2. Update Storage Factory

In `storage/factory.ts`:

```typescript
switch (storageType) {
  // ... existing cases
  case "r2":
    storageAdapter = new R2Adapter();
    break;
}
```

#### 3. Update Config

In `config/index.ts`, add R2-specific configuration.

---

## Environment Configuration

### Environment Variables Reference

#### Application

| Variable   | Required | Default       | Description                                      |
| ---------- | :------: | ------------- | ------------------------------------------------ |
| `PORT`     |    ❌    | `8866`        | Server listening port                            |
| `NODE_ENV` |    ❌    | `development` | Application environment (development/production) |

#### Database

**Common:**
| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `DB_TYPE` | ❌ | `mongodb` | Database type (`mongodb`, `postgres`, `mysql`, `sqlite`) |

**Configuration Strategies:**
You can provide either a single `DATABASE_URL` **OR** individual connection fields for SQL databases.

**MongoDB (`DB_TYPE=mongodb`):**
| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `DATABASE_URL` | ✅* | - | Connection URI (preferred) |
| `MONGO_URI` | ✅* | - | Connection URI (legacy support) |
| `DB_NAME` | ❌ | `fileservice` | Database name | \* _One of `DATABASE_URL` or `MONGO_URI` is required._

**PostgreSQL (`postgres`) & MySQL (`mysql`):**
| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `DATABASE_URL` | ❌ | - | Full connection string (overrides fields below) |
| `DB_HOST` | ❌ | `localhost` | Database host |
| `DB_PORT` | ❌ | `5432` / `3306` | Database port |
| `DB_NAME` | ❌ | `fileservice` | Database name |
| `DB_USER` | ✅* | - | Database username |
| `DB_PASSWORD` | ✅* | - | Database password | \* _Required if `DATABASE_URL` is NOT provided._

**SQLite (`DB_TYPE=sqlite`):**
| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `DATABASE_URL` | ❌ | - | Path to database file (priority 1) |
| `DB_PATH` | ❌ | `./data/fileservice.db` | Path to database file (priority 2) |

#### Storage

**Strategy Selection:**
If `LOCAL_PATH` is set, Local Storage is used. Otherwise, AWS S3 is used.

**Local Storage:**
| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `LOCAL_PATH` | ✅* | - | Local directory path for uploads | \* *Required to enable Local Storage mode.\*

**AWS S3 (Default):**
| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `AWS_ACCESS_KEY_ID` | ✅ | - | AWS Access Key |
| `AWS_SECRET_ACCESS_KEY`| ✅ | - | AWS Secret Key |
| `S3_BUCKET_NAME` | ✅ | - | S3 Bucket Name |
| `AWS_REGION` | ❌ | `us-east-1` | AWS Region |

### Complete `.env` Example

```bash
# --- Application ---
PORT=8866
NODE_ENV=development

# --- Database (Choose Strategy) ---

# Strategy A: Connection String (Recommended for DevOps)
DB_TYPE=postgres
DATABASE_URL=postgresql://user:pass@localhost:5432/fileservice

# Strategy B: Individual Fields
# DB_TYPE=postgres
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=fileservice
# DB_USER=postgres
# DB_PASSWORD=secret

# --- Storage (Choose Strategy) ---

# Strategy A: AWS S3 (Default)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=secret...
S3_BUCKET_NAME=my-bucket
AWS_REGION=us-east-1

# Strategy B: Local Filesystem
# LOCAL_PATH=./uploads
```

---

## Summary

### Key Takeaways

1. **Hono** replaces Express.js with better performance and TypeScript support
2. **Multi-database support** via the Adapter Pattern (Drizzle for SQL, custom adapter for MongoDB)
3. **Multi-storage support** via the Adapter Pattern (S3, Local FS)
4. **Configuration-driven** - Switch databases/storage by changing environment variables
5. **Type-safe** - Full TypeScript support throughout the stack

### Switching Databases is Easy

1. Change `DB_TYPE` in `.env`
2. Install required dependencies
3. Run migrations (SQL databases only)
4. Restart server

### Modifying the System

- **Add fields**: Update schema → Generate migration → Update types
- **Add endpoints**: Add controller method → Add route → Add repository method
- **Add database**: Create schema → Update adapter → Update factory → Update config
- **Add storage**: Create adapter → Update factory → Update config

---

## Additional Resources

- [Hono Documentation](https://hono.dev/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)

---

**Last Updated**: December 31, 2025
