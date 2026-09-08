import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import UploadController from "../controllers/upload.controller";
import StaticController from "../controllers/static.controller";
import PresignController from "../controllers/presign.controller";
import FinancialFileController from "../controllers/financial-file.controller";
import ContactFilesController from "../controllers/contact-files.controller";

/**
 * v1 Router — All spec endpoints under /v1
 *
 * Matches the original backend paths exactly for transparent host-switching.
 */
const v1Router = new Hono();

const uploadController = new UploadController();
const staticController = new StaticController();
const presignController = new PresignController();
const financialFileController = new FinancialFileController();
const contactFilesController = new ContactFilesController();

// ──────────────────────────────────────────────────────
// §1: Single-file upload for all context types
// POST /v1/{context}/_fileupload
// ──────────────────────────────────────────────────────
const UPLOAD_CONTEXTS = [
  "boards",
  "board",           // singular alias — frontend calls /v1/backend/board/_fileupload
  "teams",
  "users",
  "contacts",
  "conversation_messages",
  "messages",        // alias — frontend calls /v1/backend/messages/_fileupload
  "floor_plans",
  "account",
];

for (const ctx of UPLOAD_CONTEXTS) {
  v1Router.post(`/${ctx}/_fileupload`, authMiddleware, (c) =>
    uploadController.singleContextUploadWithCtx(c, ctx),
  );
}

// ──────────────────────────────────────────────────────
// §2: Multiple board attachment upload
// POST /v1/boards/upload
// ──────────────────────────────────────────────────────
v1Router.post(
  "/boards/upload",
  authMiddleware,
  uploadController.boardMultiUpload,
);

// ──────────────────────────────────────────────────────
// §3: Public form file upload (no auth)
// POST /v1/form-files
// ──────────────────────────────────────────────────────
v1Router.post("/form-files", uploadController.formFileUpload);

// ──────────────────────────────────────────────────────
// §4: Local static file download
// GET /v1/files/*
// ──────────────────────────────────────────────────────
v1Router.get("/files/*", staticController.serveStaticFile);

// ──────────────────────────────────────────────────────
// §5: Financial File CRUD
// POST /v1/financial/upload
// GET  /v1/financial/:id
// DELETE /v1/financial/:id
// ──────────────────────────────────────────────────────
v1Router.post(
  "/financial/upload",
  authMiddleware,
  financialFileController.upload,
);
v1Router.get("/financial/:id", authMiddleware, financialFileController.getById);
v1Router.delete(
  "/financial/:id",
  authMiddleware,
  financialFileController.deleteById,
);

// ──────────────────────────────────────────────────────
// §6: S3 Presign URL
// POST /v1/floor_plans/_presign_url
// ──────────────────────────────────────────────────────
v1Router.post(
  "/floor_plans/_presign_url",
  authMiddleware,
  presignController.getPresignUrl,
);

// ──────────────────────────────────────────────────────
// §7: Contact Files (proxy to backend)
// GET /v1/contact/:contact_id/files
// ──────────────────────────────────────────────────────
v1Router.get(
  "/contact/:contact_id/files",
  authMiddleware,
  contactFilesController.getContactFiles,
);

export default v1Router;
