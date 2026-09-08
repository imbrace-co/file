import { Context } from "hono";
import { uploadService } from "../../application/services/upload.service";
import { getAuth } from "../middleware/auth.middleware";
import logger from "../../infrastructure/logging/logger";

/**
 * UploadController
 *
 * Handles §1 (single context), §2 (board multi), §3 (form public) from spec.
 */
class UploadController {
  /**
   * §1 — POST /v1/{context}/_fileupload
   * Called from router with the explicit context string.
   */
  singleContextUploadWithCtx = async (c: Context, context: string) => {
    try {
      const auth = getAuth(c);

      const body = await c.req.parseBody();
      // Accept any key that is a File
      const file = Object.values(body).find((v) => v instanceof File) as
        | File
        | undefined;

      if (!file) {
        return c.json({ code: 99999, message: "No file uploaded" }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadService.singleContextUpload(
        buffer,
        file.name,
        file.type,
        context,
        auth.organization_id,
      );

      return c.json(result);
    } catch (error) {
      logger.error("Single upload error:", error);
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };

  /**
   * §1 alias — for dynamic routing (uses req.param("context"))
   * POST /v1/:context/_fileupload
   */
  singleContextUpload = async (c: Context) => {
    const context = c.req.param("context") ?? "";
    return this.singleContextUploadWithCtx(c, context);
  };

  /**
   * §2 — POST /v1/boards/upload
   * Multiple file upload for board attachment field (max 10 files).
   */
  boardMultiUpload = async (c: Context) => {
    try {
      const auth = getAuth(c);
      const body = await c.req.parseBody({ all: true });

      // Collect all uploaded files regardless of field name
      const fileEntries: File[] = [];
      for (const value of Object.values(body)) {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            if (v instanceof File) fileEntries.push(v);
          });
        } else if (value instanceof File) {
          fileEntries.push(value);
        }
      }

      if (fileEntries.length > 10) {
        return c.json(
          { code: 1, message: "maximum 10 files are allowed" },
          400,
        );
      }

      if (fileEntries.length === 0) {
        return c.json({ code: 99999, message: "No files uploaded" }, 400);
      }

      const inputs = await Promise.all(
        fileEntries.map(async (f) => ({
          buffer: Buffer.from(await f.arrayBuffer()),
          originalName: f.name,
          mimeType: f.type,
        })),
      );

      const results = await uploadService.boardMultiUpload(
        inputs,
        auth.organization_id,
        auth.user_id,
        auth.display_name || auth.email || auth.user_id,
      );

      return c.json(results);
    } catch (error: any) {
      logger.error("Board multi-upload error:", error);
      if (error.code === 1) {
        return c.json({ code: 1, message: error.message }, 400);
      }
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };

  /**
   * §3 — POST /v1/form-files
   * Public form file upload — no auth required.
   */
  formFileUpload = async (c: Context) => {
    try {
      const body = await c.req.parseBody({ all: true });

      const fileEntries: File[] = [];
      for (const value of Object.values(body)) {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            if (v instanceof File) fileEntries.push(v);
          });
        } else if (value instanceof File) {
          fileEntries.push(value);
        }
      }

      if (fileEntries.length > 10) {
        return c.json(
          { code: 1, message: "maximum 10 files are allowed" },
          400,
        );
      }

      if (fileEntries.length === 0) {
        return c.json({ code: 99999, message: "No files uploaded" }, 400);
      }

      const inputs = await Promise.all(
        fileEntries.map(async (f) => ({
          buffer: Buffer.from(await f.arrayBuffer()),
          originalName: f.name,
          mimeType: f.type,
        })),
      );

      const results = await uploadService.formFileUpload(inputs);
      return c.json(results);
    } catch (error: any) {
      logger.error("Form file upload error:", error);
      if (error.code === 1) {
        return c.json({ code: 1, message: error.message }, 400);
      }
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };
}

export default UploadController;
