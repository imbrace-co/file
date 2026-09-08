import * as fs from "fs";
import * as path from "path";
import { promises as fsPromises } from "fs";
import * as mime from "mime-types";
import * as crypto from "crypto";
import config from "../../../config";
import logger from "../../logging/logger";
import { StorageAdapter, UploadResult, DownloadResult } from "../types";

/**
 * Local File System Storage Adapter
 * Stores files in a local directory instead of S3
 */
export class LocalAdapter implements StorageAdapter {
  private storagePath: string;

  constructor() {
    if (!config.storage.localPath) {
      throw new Error("LOCAL_PATH configuration is required for local adapter");
    }

    this.storagePath = config.storage.localPath;
    this.ensureDirectoryExists(this.storagePath);
    logger.info(`Local storage adapter initialized at: ${this.storagePath}`);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`Created storage directory: ${dirPath}`);
    }
  }

  private getFilePath(filename: string): string {
    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    return path.join(this.storagePath, sanitized);
  }

  private getCorrectMimeType(fileName: string): string {
    const extension = fileName.toLowerCase().split(".").pop();

    const mimeTypes: { [key: string]: string } = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      zip: "application/zip",
      json: "application/json",
      csv: "text/csv",
    };

    return (
      mimeTypes[extension || ""] ||
      mime.lookup(fileName) ||
      "application/octet-stream"
    );
  }

  async upload(
    buffer: Buffer,
    filename: string,
    providedMimeType?: string
  ): Promise<UploadResult> {
    const filePath = this.getFilePath(filename);
    const detectedMimeType =
      providedMimeType || this.getCorrectMimeType(filename);

    try {
      await fsPromises.writeFile(filePath, buffer);

      // Calculate ETag (MD5 hash) similar to S3
      const hash = crypto.createHash("md5").update(buffer).digest("hex");

      logger.info(`File saved to local storage: ${filePath}`);

      return {
        key: filename,
        location: filePath,
        etag: hash,
        detectedMimeType,
        finalMimeType: detectedMimeType,
      };
    } catch (error) {
      logger.error(`Local upload failed: ${(error as Error).message}`);
      throw new Error(`Upload failed: ${(error as Error).message}`);
    }
  }

  async download(filename: string): Promise<DownloadResult> {
    const filePath = this.getFilePath(filename);

    try {
      const buffer = await fsPromises.readFile(filePath);
      const stats = await fsPromises.stat(filePath);
      const contentType = this.getCorrectMimeType(filename);

      logger.info(` File read from local storage: ${filePath}`);

      return {
        Body: buffer,
        ContentType: contentType,
        ContentLength: stats.size,
        LastModified: stats.mtime,
        Key: filename,
      };
    } catch (error) {
      logger.error(`Local download failed: ${(error as Error).message}`);
      throw new Error(`Download failed: ${(error as Error).message}`);
    }
  }

  async generatePresignedUrl(
    filename: string,
    expiresInMinutes: number = 30
  ): Promise<string> {
    const filePath = this.getFilePath(filename);

    // For local storage, we return the file path
    // In a production scenario, you might want to generate a token-based URL
    // that can be validated by the server

    const exists = await this.exists(filename);
    if (!exists) {
      throw new Error(`File does not exist: ${filename}`);
    }

    // Generate a simple token-based URL (in production, use proper JWT or similar)
    const token = crypto.randomBytes(32).toString("hex");
    const expiryTime = Date.now() + expiresInMinutes * 60 * 1000;

    logger.info(`Generated local presigned URL for: ${filename}`);

    const encodedFilename = encodeURIComponent(path.basename(filename));
    return `${config.serviceBaseUrl}/api/files/download/${encodedFilename}?token=${token}&expires=${expiryTime}`;
  }

  async generateBatchPresignedUrls(
    filenames: string[],
    expiresInMinutes: number = 30,
    validateExistence: boolean = false
  ): Promise<{
    urls: { [key: string]: string };
    metadata?: { [key: string]: any };
  }> {
    try {
      const urls: { [key: string]: string } = {};
      const metadata: { [key: string]: any } = {};
      // Files missing from local storage when validateExistence is on are
      // skipped rather than throwing, so one orphaned record (DB entry without
      // a file on disk) does not fail the whole batch — that previously 500'd
      // entire folder listings in data-board. Mirrors the S3 adapter behavior;
      // callers treat an absent key as "no URL".
      const missing: string[] = [];

      for (const filename of filenames) {
        const filePath = this.getFilePath(filename);

        if (validateExistence) {
          try {
            const stats = await fsPromises.stat(filePath);
            metadata[filename] = {
              contentType: this.getCorrectMimeType(filename),
              size: stats.size,
              lastModified: stats.mtime,
            };
          } catch (error) {
            missing.push(filename);
            continue;
          }
        }

        // Generate token-based URL
        const token = crypto.randomBytes(32).toString("hex");
        const expiryTime = Date.now() + expiresInMinutes * 60 * 1000;
        const encodedFilename = encodeURIComponent(path.basename(filename));
        urls[filename] = `${config.serviceBaseUrl}/api/files/download/${encodedFilename}?token=${token}&expires=${expiryTime}`;
      }

      if (missing.length > 0) {
        logger.warn(
          `Skipping ${missing.length} missing file(s) in batch presign: ${missing.join(", ")}`
        );
      }
      logger.info(`Generated ${Object.keys(urls).length} local presigned URLs`);
      return { urls, metadata: validateExistence ? metadata : undefined };
    } catch (error) {
      logger.error(
        `Failed to generate batch presigned URLs: ${(error as Error).message}`
      );
      throw new Error(
        `Failed to generate batch presigned URLs: ${(error as Error).message}`
      );
    }
  }

  async delete(filename: string): Promise<void> {
    const filePath = this.getFilePath(filename);

    try {
      await fsPromises.unlink(filePath);
      logger.info(`File deleted from local storage: ${filePath}`);
    } catch (error) {
      logger.error(`Local delete failed: ${(error as Error).message}`);
      throw new Error(`Delete failed: ${(error as Error).message}`);
    }
  }

  async exists(filename: string): Promise<boolean> {
    const filePath = this.getFilePath(filename);
    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export default LocalAdapter;
