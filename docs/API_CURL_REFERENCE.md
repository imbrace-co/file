# File Service v1 — API Curl Reference

All endpoints are available at both:

- `http://<host>/v1/...` — spec-exact path (use this for new integrations)
- `http://<host>/api/v1/...` — legacy prefix (backward compat)

**Auth:** All protected endpoints require `Authorization: Bearer <jwt>`.

---

## §1 — Single File Upload

Upload one file to a specific context bucket.

**Supported contexts:** `boards` `teams` `users` `contacts` `conversation_messages` `floor_plans` `account`

```bash
curl -X POST https://<host>/v1/<context>/_fileupload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/file.png"
```

**Response:**

```json
{ "url": "https://bucket.s3.amazonaws.com/board/org_id/file_xxx.png" }
```

---

## §2 — Board Multi-File Upload

Upload up to 10 files as board attachment. Invalid file types return per-file errors (not 4xx).

```bash
curl -X POST https://<host>/v1/boards/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/file1.png" \
  -F "files=@/path/to/file2.pdf"
```

**Response:** Array of file results:

```json
[
  {
    "user_id": "...",
    "uploader": "...",
    "name": "file1",
    "extension": "png",
    "sizeInBytes": 12345,
    "uploadDate": "2026-01-01T00:00:00Z",
    "url": "https://...",
    "key": "board/org/file_xxx.png",
    "error": null
  },
  {
    "name": "bad",
    "extension": "exe",
    "url": null,
    "key": null,
    "error": "unsupported file type exe"
  }
]
```

---

## §3 — Public Form File Upload

No auth required. Up to 10 files. `.json` extension is blocked.

```bash
curl -X POST https://<host>/v1/form-files \
  -F "files=@/path/to/doc.pdf"
```

**Response:** Array of `{ name, extension, url, key, error }`.

---

## §4 — Static File Download

Serve files from the local filesystem (`FILE_PATH` env var, defaults to `./uploads`).

```bash
curl https://<host>/v1/files/path/to/file.txt
```

Returns the file with correct `Content-Type`. Returns `404` if not found.

---

## §5 — Financial File CRUD

### Upload

```bash
curl -X POST https://<host>/v1/financial/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/report.pdf"
```

**Response:**

```json
{
  "message": "Files uploaded successfully",
  "files": [{ "fileUrl": "https://...", "fileName": "report.pdf" }]
}
```

### Get by ID

```bash
curl https://<host>/v1/financial/<id> \
  -H "Authorization: Bearer <token>"
```

**Response:** Full `financial_files` record or `404`.

### Delete

```bash
curl -X DELETE https://<host>/v1/financial/<id> \
  -H "Authorization: Bearer <token>"
```

**Response:** `{ "message": "File deleted successfully" }` or `404`.

---

## §6 — S3 Presigned Upload URL

Get a 1-hour PUT presigned URL for direct browser→S3 upload.

```bash
curl -X POST https://<host>/v1/floor_plans/_presign_url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prefix": "floor_plan", "type": "image/png"}'
```

**Response:**

```json
{
  "url": "https://s3.amazonaws.com/bucket/floor_plan/org/file_xxx.png?X-Amz-..."
}
```

---

## §7 — Contact Files

Proxies to `BACKEND_URL`. Returns `[]` if `BACKEND_URL` is not configured.

```bash
curl https://<host>/v1/contact/<contact_id>/files \
  -H "Authorization: Bearer <token>"
```

---

## Legacy API (pre-migration)

These routes are preserved for backward compatibility:

```bash
# Upload
curl -X POST https://<host>/api/files/upload -F "file=@file.png"

# Download
curl https://<host>/api/files/download/<s3-key>

# Presigned GET URL
curl "https://<host>/api/files/presigned-url/<s3-key>?expiresInMinutes=30"

# Batch presigned URLs
curl -X POST https://<host>/api/files/presigned-urls \
  -H "Content-Type: application/json" \
  -d '{"keys":["key1","key2"]}'

# Delete
curl -X DELETE https://<host>/api/files/<s3-key>
```

---

## Error Codes

| HTTP  | Body                                                  | Meaning              |
| ----- | ----------------------------------------------------- | -------------------- |
| `401` | `{"code":401,"message":"Unauthorized"}`               | Missing Bearer token |
| `401` | `{"code":401,"message":"Invalid token"}`              | Malformed JWT        |
| `400` | `{"code":1,"message":"maximum 10 files are allowed"}` | Over file limit      |
| `404` | `{"message":"File not found"}`                        | Resource not found   |
| `500` | `{"code":99999,"message":"Service Unavailable"}`      | Internal error       |
