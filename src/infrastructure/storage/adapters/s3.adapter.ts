import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as mime from "mime-types";
import config from "../../../config";
import logger from "../../logging/logger";
import { StorageAdapter, UploadResult, DownloadResult } from "../types";

/**
 * S3 Storage Adapter using AWS SDK v3
 */
export class S3Adapter implements StorageAdapter {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    if (!config.storage.s3) {
      throw new Error("S3 configuration is required for S3 adapter");
    }

    this.client = new S3Client({
      region: config.storage.s3.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.storage.s3.accessKeyId,
        secretAccessKey: config.storage.s3.secretAccessKey,
      },
    });

    this.bucketName = config.storage.s3.bucketName;
    logger.info(`S3 adapter initialized with bucket: ${this.bucketName}`);
  }

  private ensureEncoded(fileName: string): string {
    try {
      const decoded = decodeURIComponent(fileName);
      return encodeURIComponent(decoded);
    } catch {
      return encodeURIComponent(fileName);
    }
  }

  /**
   * Build an RFC 6266 Content-Disposition for inline display that is safe for
   * non-ASCII filenames (e.g. Chinese). A raw non-ASCII value in an HTTP header
   * makes the S3 PutObject throw (Node rejects non-Latin1 header chars), which
   * previously failed the whole upload. Emit an ASCII fallback plus the
   * RFC 5987 `filename*=UTF-8''…` form so the real name still survives.
   */
  private inlineContentDisposition(fileName: string): string {
    const asciiFallback = fileName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_");
    return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
      fileName,
    )}`;
  }

  private getCorrectMimeType(
    fileName: string,
    providedMimeType?: string,
  ): string {
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
      providedMimeType ||
      "application/octet-stream"
    );
  }

  async upload(
    buffer: Buffer,
    filename: string,
    providedMimeType?: string,
  ): Promise<UploadResult> {
    const detectedMimeType =
      providedMimeType || mime.lookup(filename) || "application/octet-stream";
    const correctedMimeType = this.getCorrectMimeType(
      filename,
      detectedMimeType,
    );

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: this.ensureEncoded(filename),
      Body: buffer,
      ContentType: correctedMimeType,
      Metadata: {
        // S3 object metadata must be US-ASCII; percent-encode so non-ASCII
        // (e.g. Chinese) filenames don't put invalid bytes in the header.
        originalFileName: encodeURIComponent(filename),
        uploadTimestamp: new Date().toISOString(),
      },
    });

    try {
      const result = await this.client.send(command);
      logger.info(`File uploaded to S3: ${filename}`);

      return {
        key: filename,
        location: `s3://${this.bucketName}/${filename}`,
        etag: result.ETag,
        bucket: this.bucketName,
        detectedMimeType,
        finalMimeType: correctedMimeType,
      };
    } catch (error) {
      logger.error(`S3 upload failed: ${(error as Error).message}`);
      throw new Error(`Upload failed: ${(error as Error).message}`);
    }
  }

  async download(filename: string): Promise<DownloadResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.ensureEncoded(filename),
    });

    try {
      const result = await this.client.send(command);

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      logger.info(`File downloaded from S3: ${filename}`);

      return {
        Body: buffer,
        ContentType: result.ContentType,
        ContentLength: result.ContentLength,
        LastModified: result.LastModified,
        Key: filename,
      };
    } catch (error) {
      logger.error(`S3 download failed: ${(error as Error).message}`);
      throw new Error(`Download failed: ${(error as Error).message}`);
    }
  }

  async generatePresignedUrl(
    filename: string,
    expiresInMinutes: number = 30,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.ensureEncoded(filename),
    });

    try {
      const url = await getSignedUrl(this.client, command, {
        expiresIn: expiresInMinutes * 60, // Convert to seconds
      });

      logger.info(`Generated presigned URL for: ${filename}`);
      return url;
    } catch (error) {
      logger.error(
        `Failed to generate presigned URL: ${(error as Error).message}`,
      );
      throw new Error(
        `Failed to generate presigned URL: ${(error as Error).message}`,
      );
    }
  }

  async generateBatchPresignedUrls(
    filenames: string[],
    expiresInMinutes: number = 30,
    validateExistence: boolean = false,
  ): Promise<{
    urls: { [key: string]: string };
    metadata?: { [key: string]: any };
  }> {
    try {
      const urls: { [key: string]: string } = {};
      const metadata: { [key: string]: any } = {};
      // Keys whose S3 object is missing when validateExistence is on. We skip
      // them rather than throwing, so one orphaned record (DB entry without an
      // S3 object) does not fail the whole batch — that previously 500'd entire
      // folder listings in data-board. Callers treat an absent key as "no URL".
      const missing: string[] = [];

      if (validateExistence) {
        for (const filename of filenames) {
          try {
            const headResult = await this.client.send(
              new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: this.ensureEncoded(filename),
              }),
            );

            const s3ContentType = headResult.ContentType;
            const correctedContentType = this.getCorrectMimeType(
              filename,
              s3ContentType,
            );

            metadata[filename] = {
              contentType: s3ContentType,
              size: headResult.ContentLength,
              lastModified: headResult.LastModified,
              correctedContentType:
                correctedContentType !== s3ContentType
                  ? correctedContentType
                  : undefined,
            };
          } catch (error) {
            missing.push(filename);
          }
        }
        if (missing.length > 0) {
          logger.warn(
            `Skipping ${missing.length} missing object(s) in batch presign: ${missing.join(", ")}`,
          );
        }
      }

      for (const filename of filenames) {
        // Don't sign URLs for objects we already know are missing.
        if (validateExistence && !metadata[filename]) {
          continue;
        }
        const contentType =
          metadata[filename]?.correctedContentType ||
          this.getCorrectMimeType(filename, metadata[filename]?.contentType);

        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: this.ensureEncoded(filename),
          ResponseContentType: contentType,
        });

        const url = await getSignedUrl(this.client, command, {
          expiresIn: expiresInMinutes * 60,
        });

        urls[filename] = url;
      }

      logger.info(`Generated ${filenames.length} presigned URLs`);
      return { urls, metadata: validateExistence ? metadata : undefined };
    } catch (error) {
      logger.error(
        `Failed to generate batch presigned URLs: ${(error as Error).message}`,
      );
      throw new Error(
        `Failed to generate batch presigned URLs: ${(error as Error).message}`,
      );
    }
  }

  async delete(filename: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: this.ensureEncoded(filename),
    });

    try {
      await this.client.send(command);
      logger.info(`File deleted from S3: ${filename}`);
    } catch (error) {
      logger.error(`S3 delete failed: ${(error as Error).message}`);
      throw new Error(`Delete failed: ${(error as Error).message}`);
    }
  }

  async exists(filename: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.ensureEncoded(filename),
        }),
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Upload a file to S3 with public-read ACL and return the public URL.
   * This is the primary method used by the spec endpoints.
   */
  async uploadPublicFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
    fileName?: string,
  ): Promise<{ Location: string; Key: string }> {
    const baseInput = {
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ...(fileName && {
        ContentDisposition: this.inlineContentDisposition(fileName),
      }),
      Metadata: {
        uploadTimestamp: new Date().toISOString(),
      },
    };

    try {
      try {
        // Preferred: public-read ACL (works on legacy ACL-enabled buckets).
        await this.client.send(
          new PutObjectCommand({ ...baseInput, ACL: "public-read" as any }),
        );
      } catch (aclErr) {
        const msg = (aclErr as Error).message || "";
        const code = (aclErr as any)?.Code || (aclErr as any)?.name || "";
        // Modern buckets use Object Ownership = "bucket owner enforced" → ACLs
        // are disabled and any ACL header is rejected. Retry without the ACL;
        // public access on such buckets is governed by the bucket policy.
        if (/ACL|AccessControlListNotSupported|does not allow ACLs/i.test(`${msg} ${code}`)) {
          logger.warn(`S3 bucket disallows ACLs — re-uploading without ACL: ${key}`);
          await this.client.send(new PutObjectCommand(baseInput));
        } else {
          throw aclErr;
        }
      }
      const s3Config = config.storage.s3!;
      // S3_URL, when set, overrides the entire link base (e.g. a CDN or
      // custom domain). Otherwise fall back to the region/bucket form.
      const location = s3Config.publicUrl
        ? `${s3Config.publicUrl}/${key}`
        : `https://s3.${s3Config.region}.amazonaws.com/${this.bucketName}/${key}`;
      logger.info(`File uploaded to S3: ${key}`);
      return { Location: location, Key: key };
    } catch (error) {
      logger.error(`S3 public upload failed: ${(error as Error).message}`);
      throw new Error(`Upload failed: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a file from S3 by its exact key.
   */
  async deleteFileByKey(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.client.send(command);
      logger.info(`File deleted from S3 by key: ${key}`);
    } catch (error) {
      logger.error(`S3 delete by key failed: ${(error as Error).message}`);
      throw new Error(`Delete failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate a presigned PUT URL for direct browser-to-S3 upload.
   * @param key - S3 key for the object
   * @param mimeType - Content-Type for the upload
   * @param expiresInSeconds - URL validity (default 3600s = 1hr)
   */
  async getPresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimeType,
      ACL: "public-read" as any,
    });

    try {
      const url = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });
      logger.info(`Generated presigned PUT URL for key: ${key}`);
      return url;
    } catch (error) {
      logger.error(
        `Failed to generate presigned PUT URL: ${(error as Error).message}`,
      );
      throw new Error(
        `Failed to generate presigned PUT URL: ${(error as Error).message}`,
      );
    }
  }

  get bucket(): string {
    return this.bucketName;
  }
}

export default S3Adapter;
