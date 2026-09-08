import { Context } from "hono";
import { S3Adapter } from "../../infrastructure/storage/adapters/s3.adapter";
import { getStorage } from "../../infrastructure/storage/factory";
import {
  getFileUploadPath,
  getExtensionFromMime,
} from "../../infrastructure/storage/upload-path.util";
import { getAuth } from "../middleware/auth.middleware";
import logger from "../../infrastructure/logging/logger";

/**
 * PresignController
 *
 * §6 — POST /v1/floor_plans/_presign_url
 * Returns a presigned S3 PUT URL for direct browser upload.
 */
class PresignController {
  getPresignUrl = async (c: Context) => {
    try {
      const auth = getAuth(c);
      const body = await c.req.json();

      const { prefix, type: mimeType } = body as {
        prefix?: string;
        type?: string;
      };

      if (!prefix || !mimeType) {
        return c.json(
          { code: 99999, message: "prefix and type are required" },
          400,
        );
      }

      const extension = getExtensionFromMime(mimeType);
      const key = getFileUploadPath(prefix, auth.organization_id, extension);

      const storage = getStorage();
      if (!(storage instanceof S3Adapter)) {
        return c.json({ code: 99999, message: "S3 storage required" }, 500);
      }

      const url = await storage.getPresignedUploadUrl(key, mimeType, 3600);

      logger.info(`Presign URL generated: ${key}`);
      return c.json({ url });
    } catch (error) {
      logger.error("Presign URL error:", error);
      return c.json({ code: 99999, message: "Service Unavailable" }, 500);
    }
  };
}

export default PresignController;
