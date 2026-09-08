# Frontend API Migration Guide — Backend → File-Service

This document tells frontend developers exactly which API paths need to change, and what the gateway team needs to add to enable the migration.

---

## How It Works

```
Browser → App Gateway → (backend | file-service)
```

The frontend calls everything through the **App Gateway** using relative URLs (`/api` base). The gateway decides which service to forward to based on the path prefix.

**Current state:**
- `/v1/backend/*` → **Backend** (all file uploads go here today)
- `/files/*` → **File-Service** (legacy `/api/files/*` routes — already live)

**After migration:**
- `/v1/backend/*` → **Backend** (unchanged — non-file routes stay)
- `/files/*` → **File-Service** (unchanged — legacy routes stay)
- `/v1/files/*` → **File-Service** ⬅ new route to be added by gateway team

---

## Frontend Changes — Replace ONE prefix

For every file upload call, change the path prefix from `/v1/backend/` → `/v1/files/`.
That's the only change. No axios client changes, no auth changes.

```diff
- /v1/backend/{context}/_fileupload
+ /v1/files/{context}/_fileupload
```

---

## File-by-File Changes

### `src/services/api/crm.ts`

```diff
export const postBoardFile = {
-   api: '/v1/backend/board/_fileupload',
+   api: '/v1/files/board/_fileupload',
    method: fetchMethod.POST,
};

export const postBoardUpload = {
-   api: '/v1/backend/board/upload',
+   api: '/v1/files/boards/upload',
    method: fetchMethod.POST,
};
```

### `src/services/api/team.ts`

```diff
export const postTeamIcon = {
-   api: '/v1/backend/teams/_fileupload',
+   api: '/v1/files/teams/_fileupload',
    method: fetchMethod.POST,
};
```

### `src/services/api/member.ts`

```diff
export const postMemberAvatar = {
-   api: '/v1/backend/users/_fileupload',
+   api: '/v1/files/users/_fileupload',
    method: fetchMethod.POST,
};
```

### `src/services/api/contact.ts`

```diff
export const getContactFile = {
-   api: (contactId: string) => `/v1/backend/contact/${contactId}/files`,
+   api: (contactId: string) => `/v1/files/contact/${contactId}/files`,
    method: fetchMethod.GET,
};

export const postContactAvatar = {
-   api: '/v1/backend/contacts/_fileupload',
+   api: '/v1/files/contacts/_fileupload',
    method: fetchMethod.POST,
};
```

### `src/services/api/account.ts`

```diff
export const postAccountAvatar = {
-   api: '/v1/backend/account/_fileupload',
+   api: '/v1/files/account/_fileupload',
    method: fetchMethod.POST,
};
```

### `src/services/api/teamConversation.ts`

```diff
export const postConversationFileUpload = {
-   api: '/v1/backend/conversation_messages/_fileupload',
+   api: '/v1/files/conversation_messages/_fileupload',
    method: fetchMethod.POST,
};
```

### `src/services/api/messages.ts`

```diff
export const postMessageFileUpload = {
-   api: '/v1/backend/messages/_fileupload',
+   api: '/v1/files/messages/_fileupload',
    method: fetchMethod.POST,
};
```

---

## Response Shapes (Unchanged)

All responses are identical — no frontend logic changes needed.

**`_fileupload` (single file):**
```json
{ "url": "https://s3.amazonaws.com/<bucket>/<prefix>/<org_id>/file_<random>.<ext>" }
```

**`boards/upload` (multi-file):**
```json
[
  {
    "user_id": "string",
    "uploader": "string",
    "name": "string",
    "extension": "string",
    "sizeInBytes": 1234,
    "uploadDate": "ISO8601",
    "url": "https://...",
    "key": "board/<org_id>/file_<random>.<ext>",
    "error": null
  }
]
```

**`contact/:id/files` (contact media files):**
```json
[
  {
    "_id": "string",
    "type": "IMAGE | AUDIO | VIDEO | PDF",
    "from": "string",
    "content": { "url": "https://...", "caption": "file01", "extension": "jpg" },
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
]
```

---

## Routes NOT Changing (Stay on Backend / Other Services)

| Function | File | Path | Service |
|---|---|---|---|
| `postKnowledgeBaseFile` | `api/knowledgeBase.ts` | `POST /v1/backend/knowledge/upload` | Backend |
| `getListFinancialFileError` | `api/financialReport.ts` | `GET /v2/ai/financial_documents/...` | AI Service |
| `updateFinancialFile` | `api/financialReport.ts` | `PUT /v2/ai/financial_documents/:id` | AI Service |
| `deleteFinancialFile` | `api/financialReport.ts` | `DELETE /v2/ai/financial_documents/:id` | AI Service |
| All `knowledgeHub.ts` routes | `api/knowledgeHub.ts` | `/data-board/*` | Data Board Service |

---

## Gateway Changes Required

> **For the gateway team** — add this new router in `app-gateway`.

**1. Create `src/server/public/routers/files-v1.ts`:**

```typescript
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const fileServiceV1Proxy = createProxyMiddleware({
  target: config.fileService.host,
  changeOrigin: true,
  pathRewrite: {
    '^/v1/files': '/api/v1',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 60000,
  timeout: 60000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      if (req.userContext?.access_token) {
        proxyReq.setHeader('Authorization', `Bearer ${req.userContext.access_token}`);
      }
      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
    },
    error: (err, req: Request) => {
      console.error(`File-service v1 proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

const fileServiceV1 = [authorize, fileServiceV1Proxy];

export default fileServiceV1;
```

**2. Register in `src/server/public/index.ts` — before `/v1/backend`:**

```diff
+ import fileServiceV1 from './routers/files-v1';

  // File Service (legacy)
  app.use('/files', fileService);

+ // File Service v1 — must be before /v1/backend
+ app.use('/v1/files', fileServiceV1);

  // Backend API routes with authentication
  app.use('/v1/backend', apiBackendService);
```

**Path mapping result:**

| Frontend calls | Gateway rewrites to | File-Service receives |
|---|---|---|
| `POST /v1/files/board/_fileupload` | `POST /api/v1/board/_fileupload` | ✅ |
| `POST /v1/files/boards/upload` | `POST /api/v1/boards/upload` | ✅ |
| `POST /v1/files/teams/_fileupload` | `POST /api/v1/teams/_fileupload` | ✅ |
| `POST /v1/files/users/_fileupload` | `POST /api/v1/users/_fileupload` | ✅ |
| `POST /v1/files/contacts/_fileupload` | `POST /api/v1/contacts/_fileupload` | ✅ |
| `POST /v1/files/account/_fileupload` | `POST /api/v1/account/_fileupload` | ✅ |
| `POST /v1/files/conversation_messages/_fileupload` | `POST /api/v1/conversation_messages/_fileupload` | ✅ |
| `POST /v1/files/messages/_fileupload` | `POST /api/v1/messages/_fileupload` | ✅ |
| `GET  /v1/files/contact/:id/files` | `GET  /api/v1/contact/:id/files` | ✅ |

---

## Deployment Order

1. ✅ **File-Service** — deployed to dev
2. ⬜ **Gateway** — add `/v1/files` proxy rule (gateway team)
3. ⬜ **Frontend** — change path prefix `backend` → `files` in 7 files above
4. ⬜ **Test** — verify each upload context end-to-end on dev
5. ⬜ **Backend** — remove file upload handlers once stable
