import { Context } from "hono";
import * as fs from "fs";
import * as path from "path";
import logger from "../../infrastructure/logging/logger";
import config from "../../config";

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
};

/**
 * StaticController
 *
 * §4 — GET /v1/files/* — Serve local static files from the base FILE_PATH dir.
 */
class StaticController {
  serveStaticFile = async (c: Context) => {
    try {
      // Default to ./uploads relative to cwd if FILE_PATH is not set
      const basePath = config.filePath || "./uploads";

      // Extract the wildcard path after /v1/files/
      const relativePath =
        c.req.param("*") || c.req.path.replace(/^\/v1\/files\//, "");

      // Prevent path traversal
      const fullPath = path.resolve(basePath, relativePath);
      if (!fullPath.startsWith(path.resolve(basePath))) {
        return c.json({ message: "File not found" }, 404);
      }

      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return c.json({ message: "File not found" }, 404);
      }

      const stat = fs.statSync(fullPath);
      const ext = path.extname(fullPath).replace(".", "").toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      const fileBuffer = fs.readFileSync(fullPath);

      c.header("Content-Type", contentType);
      c.header("Content-Length", stat.size.toString());
      c.header("Access-Control-Allow-Origin", "*");

      return c.body(new Uint8Array(fileBuffer));
    } catch (error) {
      logger.error("Static file serve error:", error);
      return c.json({ message: "File not found" }, 404);
    }
  };
}

export default StaticController;
