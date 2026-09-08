# File-Service API Migration Spec

This document describes all file-related APIs currently living in the backend (Node.js/Fastify + MongoDB/Mongoose) that should be migrated
and re-implemented in the **file-service** (HonoJS + Drizzle ORM).

---

## Architecture Context

The file-service should:

-   Use **HonoJS** for routing
-   Use **Drizzle ORM** with PostgreSQL for persistent metadata storage
-   Use **AWS S3** for actual binary storage (upload/download)
-   Follow **Clean Architecture**: router → controller → service → repository

Storage prefix convention (currently in use in the backend):

```
s3://<bucket>/<prefix>/<organization_id>/file_<randomStr>.<ext>
```

Where `prefix` is a context label like `board`, `contact`, `form`, `financial`, `floor_plan`, `chat`, etc.

---

## 1. General Single-File Upload

Used in multiple contexts (board attachment field, contact avatar, team avatar, user avatar, floor plan image, etc.).

### Endpoint Pattern

```
POST /v1/{context}/_fileupload
```

Where `{context}` is one of: `boards`, `teams`, `users`, `contacts`, `conversation_messages`, `floor_plans`, `account`

### Auth

Bearer token (`Authorization: Bearer <token>`) — user must be authenticated.

### Request

-   **Content-Type**: `multipart/form-data`
-   **Body**: Single file field (the multipart file stream directly)

### Processing Logic

1. Read the file from multipart stream
2. Detect MIME type → get extension
3. Generate an S3 key: `{prefix}/{organization_id}/file_{26-char-random}.{ext}`
4. Upload buffer to S3 (public-read ACL)
5. Return the S3 public URL

### Response `200 OK`

```json
{
    "url": "https://s3.amazonaws.com/<bucket>/<prefix>/<org_id>/file_<random>.<ext>"
}
```

### Response `500`

```json
{ "code": 99999, "message": "Service Unavailable" }
```

---

## 2. Multiple File Upload (Board Attachment)

Used for board field type `ATTACHMENT` — allows uploading multiple files at once.

### Endpoint

```
POST /v1/boards/upload
```

### Auth

Bearer token — authenticated user required.

### Request

-   **Content-Type**: `multipart/form-data`
-   **Body**: Multiple file fields (up to 10 files)

### Supported File Types

| Category  | Extensions                                                         |
| --------- | ------------------------------------------------------------------ |
| Images    | gif, tiff, tif, svg, jpg, jpeg, png                                |
| Documents | txt, ai, psd, csv, doc, docx, pdf, ppt, pptx, xls, xlsx, mp4, json |

### Processing Logic

1. Iterate over each file in the multipart stream (max 10)
2. Validate extension against supported list
3. For each valid file:
    - Generate S3 key: `board/{organization_id}/file_{26-char-random}.{ext}`
    - Upload to S3
    - Record metadata: uploader name, user ID, upload date, size in bytes
4. Return array of result objects (even if some have errors)

### Response `200 OK`

```json
[
    {
        "user_id": "string",
        "uploader": "string (display_name)",
        "name": "string (filename without extension)",
        "extension": "string",
        "sizeInBytes": 1234567,
        "uploadDate": "ISO8601 datetime",
        "url": "https://s3.amazonaws.com/...",
        "key": "board/{org_id}/file_{random}.{ext}",
        "error": null
    },
    {
        "user_id": "string",
        "uploader": "string",
        "name": "bad_file",
        "extension": "exe",
        "sizeInBytes": 0,
        "uploadDate": null,
        "url": null,
        "key": null,
        "error": "unsupported file type exe"
    }
]
```

### Response `400`

```json
{ "code": 1, "message": "maximum 10 files are allowed" }
```

---

## 3. Public Form File Upload

Used by public (unauthenticated) forms for collecting user file submissions.

### Endpoint

```
POST /v1/form-files
```

### Auth

**None** — this route is public. No auth token required.

### Request

-   **Content-Type**: `multipart/form-data`
-   **Body**: Multiple file fields (up to 10 files)

### Supported File Types

Same as §2 (images + documents), but **without** `json`.

### Processing Logic

1. Iterate files (max 10)
2. Validate extension
3. Generate S3 key: `form/files/file_{26-char-random}.{ext}`
4. Upload to S3
5. Return array of results

### Response `200 OK`

```json
[
    {
        "name": "string",
        "extension": "string",
        "url": "https://s3.amazonaws.com/...",
        "key": "form/files/file_{random}.{ext}",
        "error": null
    }
]
```

---

## 4. Local Static File Download (Serve Static Files)

Serves files stored on the local filesystem (not S3). These are internally generated or cached files.

### Endpoint

```
GET /v1/files/*
```

Everything after `/v1/files/` is treated as a relative path within a base directory (`config.filePath`).

### Auth

**None required** — public accessible (used for CORS-permitted domains).

### Path Param

-   `*` — relative file path, e.g. `board/abc123/export.csv`

### Processing Logic

1. Resolve full local path: `{BASE_FILE_PATH}/{*}`
2. Verify file exists (404 if not)
3. Detect Content-Type from extension (with `charset=utf-8` for text types)
4. Stream file contents in response

### Response `200 OK`

-   Binary/text file stream
-   `Content-Type`: appropriate MIME type
-   `Content-Length`: file size in bytes
-   `Access-Control-Allow-Origin`: (set by server config)

### Response `404`

```json
{ "message": "File not found" }
```

---

## 5. Financial File CRUD

A dedicated file entity for financial document storage. Each file is tied to an organization and tracked in the database.

### 5.1 Upload Financial File

```
POST /v1/financial/upload
```

**Auth**: Bearer token (authenticated user)

**Request**: `multipart/form-data`, up to 10 files.

**Processing Logic**:

1. For each file: generate S3 key `financial/{organization_id}/file_{random}.{ext}`
2. Upload to S3
3. Save metadata record to DB (see model below)
4. Forward `{ fileUrl, fileName }` list to an AI service for processing (`POST /v1/financial_documents/upload`)
5. Return AI service response

**Response `200 OK`**: AI service response (varies, typically a success acknowledgment)

---

### 5.2 Get Financial File by ID

```
GET /v1/financial/:id
```

**Auth**: Bearer token

**Path param**: `id` — financial file record ID

**Response `200 OK`**:

```json
{
    "id": "uuid-string",
    "file_name": "invoice.pdf",
    "original_url": "https://s3.amazonaws.com/financial/...",
    "updated_link": null,
    "organization_id": "string",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
}
```

**Response `404`**: `{ "message": "File not found" }`

---

### 5.3 Delete Financial File

```
DELETE /v1/financial/:id
```

**Auth**: Bearer token

**Path param**: `id` — financial file record ID

**Processing Logic**:

1. Look up record by ID + organization_id (scoped to org)
2. Delete from S3 at key `financial/{organization_id}/{file_name}`
3. Delete DB record

**Response `200 OK`**: `{ "message": "File deleted successfully" }`

**Response `404`**: `{ "message": "File not found" }`

---

## 6. S3 Presign URL (Upload Intent)

Used by clients that upload directly to S3 without going through the server.

### Endpoint

```
POST /v1/floor_plans/_presign_url
```

> **Note**: This pattern is used by FloorPlan currently, but the logic is generic.

### Auth

Bearer token — authenticated user required.

### Request Body

```json
{
    "prefix": "string (e.g. 'floor_plan')",
    "type": "string (MIME type e.g. 'image/png')"
}
```

### Processing Logic

1. Extract file type from MIME
2. Generate S3 key: `{prefix}/{organization_id}/file_{26-char-random}.{ext}`
3. Call `s3.getSignedUrl('putObject', ...)` with 1-hour expiry and `public-read` ACL
4. Return presigned URL

### Response `200 OK`

```json
{
    "url": "https://s3.amazonaws.com/...?X-Amz-Signature=..."
}
```

---

## 7. Contact Files (Conversation Message Files)

Returns all media files (images, audio, video, PDF) shared via conversation messages with a given contact.

### Endpoint

```
GET /v1/contact/:contact_id/files
```

### Auth

Bearer token — user must be a participant in the conversation.

### Path Param

-   `contact_id` — MongoDB/UUID of the contact

### Processing Logic

1. Find the contact's conversation
2. Verify the authenticated user is part of that conversation (team conversation user check)
3. Fetch all conversation messages of type: `IMAGE`, `AUDIO`, `VIDEO`, `PDF`
4. For each message, resolve `content.extension` via HTTP HEAD on the file URL
5. Auto-generate captions (`file01`, `file02`, …) for messages without captions

### Response `200 OK`

```json
[
    {
        "_id": "string",
        "type": "IMAGE | AUDIO | VIDEO | PDF",
        "from": "string",
        "content": {
            "url": "https://...",
            "caption": "file01",
            "extension": "jpg"
        },
        "created_at": "ISO8601",
        "updated_at": "ISO8601"
    }
]
```

Returns `[]` if contact has no conversation or user is not in the conversation.

---

## Data Models

### Financial File (Drizzle Schema)

Map this Mongoose schema to Drizzle ORM with PostgreSQL:

| Column            | Type        | Constraints     | Notes              |
| ----------------- | ----------- | --------------- | ------------------ |
| `id`              | `varchar`   | PK              | UUID v4            |
| `file_name`       | `varchar`   | NOT NULL        | e.g. `invoice.pdf` |
| `original_url`    | `text`      | NOT NULL        | S3 public URL      |
| `updated_link`    | `text`      | NULLABLE        | Updated/signed URL |
| `organization_id` | `varchar`   | NOT NULL, INDEX | Scoped per org     |
| `created_at`      | `timestamp` | NOT NULL        | Auto-set           |
| `updated_at`      | `timestamp` | NOT NULL        | Auto-updated       |

**Drizzle example:**

```ts
export const financialFiles = pgTable('financial_files', {
    id: varchar('id').primaryKey(),
    file_name: varchar('file_name', { length: 255 }).notNull(),
    original_url: text('original_url').notNull(),
    updated_link: text('updated_link'),
    organization_id: varchar('organization_id', { length: 255 }).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
});
```

---

## S3 / Storage Utility Interface

The file-service needs an S3 utility with these methods:

```ts
interface StorageService {
    // Upload a buffer to S3, returns the public URL and S3 key
    uploadFile(key: string, buffer: Buffer, mimeType: string, fileName?: string): Promise<{ Location: string; Key: string }>;

    // Delete a file from S3 by key
    deleteFile(key: string): Promise<void>;

    // Get a presigned PUT URL for direct browser upload
    getPresignedUploadUrl(key: string, mimeType: string, expiresInSeconds?: number): Promise<string>;
}
```

### Key Generation Utility

```ts
function getFileUploadPath(prefix: string, organizationId: string, extension: string): string {
    return `${prefix}/${organizationId}/file_${randomStr(26)}.${extension}`;
}
```

---

## Authentication

All authenticated endpoints require:

-   **Header**: `Authorization: Bearer <access_token>`
-   The middleware should extract `organization_id` and `user_id` from the token and attach them to the request context.

Public endpoints (like `/v1/form-files`) have no auth requirement.

---

## Error Response Format

Be consistent with the existing backend error format:

```json
{
    "code": 99999,
    "message": "Service Unavailable"
}
```

Or for simpler cases:

```json
{
    "message": "File not found"
}
```

---

## Endpoint Summary Table

| Method   | Path                                    | Auth      | Description                                     |
| -------- | --------------------------------------- | --------- | ----------------------------------------------- |
| `POST`   | `/v1/boards/_fileupload`                | ✅ Bearer | Single file upload for board context            |
| `POST`   | `/v1/boards/upload`                     | ✅ Bearer | Multiple file upload for board attachment field |
| `POST`   | `/v1/contacts/_fileupload`              | ✅ Bearer | Single file upload for contact context          |
| `POST`   | `/v1/teams/_fileupload`                 | ✅ Bearer | Single file upload for team context             |
| `POST`   | `/v1/users/_fileupload`                 | ✅ Bearer | Single file upload for user context             |
| `POST`   | `/v1/account/_fileupload`               | ✅ Bearer | Single file upload for account (user profile)   |
| `POST`   | `/v1/conversation_messages/_fileupload` | ✅ Bearer | Single file upload for conversation message     |
| `POST`   | `/v1/floor_plans/_fileupload`           | ✅ Bearer | Single file upload for floor plan image         |
| `POST`   | `/v1/floor_plans/_presign_url`          | ✅ Bearer | Get S3 presign URL for direct browser upload    |
| `POST`   | `/v1/form-files`                        | ❌ Public | Multiple file upload from public form           |
| `GET`    | `/v1/files/*`                           | ❌ Public | Serve local static files (stream)               |
| `POST`   | `/v1/financial/upload`                  | ✅ Bearer | Upload financial document(s) to S3 + DB         |
| `GET`    | `/v1/financial/:id`                     | ✅ Bearer | Get financial file metadata                     |
| `DELETE` | `/v1/financial/:id`                     | ✅ Bearer | Delete financial file from S3 + DB              |
| `GET`    | `/v1/contact/:contact_id/files`         | ✅ Bearer | List media files from contact's conversation    |
