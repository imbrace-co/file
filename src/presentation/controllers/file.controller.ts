import { Context } from "hono";
import { fileService } from "../../application/services/file.service";
import logger from "../../infrastructure/logging/logger";

/**
 * File Controller - Presentation Layer
 *
 * Handles HTTP requests and responses for file operations.
 * Delegates business logic to the service layer.
 *
 * Responsibilities:
 * - Parse and validate HTTP requests
 * - Call appropriate service methods
 * - Format HTTP responses
 * - Handle HTTP-specific errors
 */
class FileController {
  /**
   * Upload file handler
   *
   * POST /api/files/upload
   * Content-Type: multipart/form-data
   */
  upload = async (c: Context) => {
    try {
      // Parse multipart form data
      const body = await c.req.parseBody();
      const file = body["file"];

      // Validate file presence
      if (!file || !(file instanceof File)) {
        return c.json({ error: "No file uploaded" }, 400);
      }

      // Read file buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = file.name;
      const mimetype = file.type;

      // Delegate to service layer
      const result = await fileService.uploadFile({
        buffer,
        filename,
        mimetype,
      });

      // Return response
      return c.json(result);
    } catch (error) {
      logger.error("File upload controller error:", error);
      return c.json({ error: (error as Error).message }, 500);
    }
  };

  /**
   * Download file handler
   *
   * GET /api/files/download/:fileName
   * Query params: download=true (optional, force download vs inline)
   */
  download = async (c: Context) => {
    try {
      // Get and validate file name
      const fileName = c.req.param("fileName");
      if (!fileName) {
        return c.json({ error: "File name is required" }, 400);
      }

      // Delegate to service layer
      const result = await fileService.downloadFile({ fileName });

      // Set response headers
      const contentType = result.ContentType || "application/octet-stream";
      const isDownload = c.req.query("download") === "true";
      const disposition = isDownload ? "attachment" : "inline";

      c.header("Content-Type", contentType);
      c.header("Content-Disposition", `${disposition}; filename="${fileName}"`);

      // Return file buffer
      return c.body(new Uint8Array(result.Body));
    } catch (error) {
      logger.error("File download controller error:", error);
      return c.json({ error: (error as Error).message }, 500);
    }
  };

  /**
   * Generate batch presigned URLs
   *
   * POST /api/files/presigned-urls
   * Body: { keys: string[] }
   * Query params: expiresInMinutes=30, validateExistence=false
   */
  generateBatchPresignedUrls = async (c: Context) => {
    try {
      // Parse request body
      const { keys } = await c.req.json();

      // Parse query parameters
      const expiresInMinutes = c.req.query("expiresInMinutes")
        ? parseInt(c.req.query("expiresInMinutes") as string)
        : 30;
      const validateExistence = c.req.query("validateExistence") === "true";

      // Delegate to service layer (service handles validation)
      const result = await fileService.generateBatchPresignedUrls({
        keys,
        expiresInMinutes,
        validateExistence,
      });

      // Return response
      return c.json(result);
    } catch (error) {
      logger.error("Batch presigned URLs controller error:", error);

      // Return appropriate status code based on error
      if (error instanceof Error && error.message.includes("required")) {
        return c.json({ error: error.message }, 400);
      }
      if (error instanceof Error && error.message.includes("Maximum")) {
        return c.json({ error: error.message }, 400);
      }
      if (error instanceof Error && error.message.includes("between")) {
        return c.json({ error: error.message }, 400);
      }

      return c.json({ error: (error as Error).message }, 500);
    }
  };

  /**
   * Delete file handler
   *
   * DELETE /api/files/:fileName
   */
  deleteFile = async (c: Context) => {
    try {
      // Get and validate file name
      const fileName = c.req.param("fileName");
      if (!fileName) {
        return c.json({ error: "File name is required" }, 400);
      }

      // Delegate to service layer
      await fileService.deleteFile(fileName);

      // Return success response
      return c.json({ message: "File deleted successfully" });
    } catch (error) {
      logger.error("File deletion controller error:", error);
      return c.json({ error: (error as Error).message }, 500);
    }
  };

  /**
   * Generate single presigned URL
   *
   * GET /api/files/presigned-url/:fileName
   * Query params: expiresInMinutes=30
   */
  generatePresignedUrl = async (c: Context) => {
    try {
      // Get and validate file name
      const fileName = c.req.param("fileName");
      if (!fileName) {
        return c.json({ error: "File name is required" }, 400);
      }

      // Parse query parameters
      const expiresInMinutes = c.req.query("expiresInMinutes")
        ? parseInt(c.req.query("expiresInMinutes") as string)
        : 30;

      // Delegate to service layer
      const url = await fileService.generatePresignedUrl(
        fileName,
        expiresInMinutes
      );

      // Return response
      return c.json({
        url,
        expiresIn: `${expiresInMinutes} minutes`,
      });
    } catch (error) {
      logger.error("Generate presigned URL controller error:", error);

      if (error instanceof Error && error.message.includes("between")) {
        return c.json({ error: error.message }, 400);
      }

      return c.json({ error: (error as Error).message }, 500);
    }
  };
}

export default FileController;
