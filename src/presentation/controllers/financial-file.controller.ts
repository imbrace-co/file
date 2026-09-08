import { Context } from "hono";
import { financialFileService } from "../../application/services/financial-file.service";
import { getAuth } from "../middleware/auth.middleware";
import logger from "../../infrastructure/logging/logger";

/**
 * FinancialFileController
 *
 * §5 — Financial file CRUD
 */
class FinancialFileController {
  /**
   * §5.1 — POST /v1/financial/upload
   */
  upload = async (c: Context) => {
    try {
      const auth = getAuth(c);
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

      if (fileEntries.length === 0) {
        return c.json({ code: 99999, message: "No files uploaded" }, 400);
      }

      if (fileEntries.length > 10) {
        return c.json(
          { code: 1, message: "maximum 10 files are allowed" },
          400,
        );
      }

      const inputs = await Promise.all(
        fileEntries.map(async (f) => ({
          buffer: Buffer.from(await f.arrayBuffer()),
          originalName: f.name,
          mimeType: f.type,
        })),
      );

      const result = await financialFileService.upload(
        inputs,
        auth.organization_id,
      );

      return c.json(result);
    } catch (error) {
      logger.error("Financial upload error:", error);
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };

  /**
   * §5.2 — GET /v1/financial/:id
   */
  getById = async (c: Context) => {
    try {
      const auth = getAuth(c);
      const id = c.req.param("id");

      const record = await financialFileService.getById(
        id,
        auth.organization_id,
      );

      if (!record) {
        return c.json({ message: "File not found" }, 404);
      }

      return c.json(record);
    } catch (error) {
      logger.error("Financial get error:", error);
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };

  /**
   * §5.3 — DELETE /v1/financial/:id
   */
  deleteById = async (c: Context) => {
    try {
      const auth = getAuth(c);
      const id = c.req.param("id");

      await financialFileService.delete(id, auth.organization_id);

      return c.json({ message: "File deleted successfully" });
    } catch (error: any) {
      logger.error("Financial delete error:", error);
      if (error.statusCode === 404) {
        return c.json({ message: "File not found" }, 404);
      }
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };
}

export default FinancialFileController;
