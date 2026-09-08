import { getStorage } from "../../infrastructure/storage/factory";
import { fileRepository } from "../../infrastructure/database/repositories/file.repository";
import logger from "../../infrastructure/logging/logger";
import {
  UploadResult,
  DownloadResult,
  BatchPresignedUrlResult,
} from "../../infrastructure/storage/types";

/**
 * File Service - Application/Business Logic Layer
 *
 * This service acts as an intermediary between the presentation layer (controllers)
 * and the infrastructure layer (storage, database).
 *
 * Responsibilities:
 * - Business logic and validation
 * - Orchestrating infrastructure services
 * - Error handling and logging
 * - Data transformation
 */

export interface UploadFileDTO {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export interface UploadFileResponse {
  message: string;
  data: UploadResult;
  fileInfo: {
    originalName: string;
    detectedMimeType?: string;
    finalMimeType?: string;
    size: number;
  };
}

export interface DownloadFileDTO {
  fileName: string;
}

export interface GeneratePresignedUrlsDTO {
  keys: string[];
  expiresInMinutes: number;
  validateExistence: boolean;
}

export interface GeneratePresignedUrlsResponse {
  urls: Record<string, string>;
  expiresIn: string;
  validated: boolean;
  metadata?: Record<string, any>;
}

class FileService {
  /**
   * Upload a file to storage
   *
   * @param dto - Upload file data transfer object
   * @returns Upload result with file information
   */
  async uploadFile(dto: UploadFileDTO): Promise<UploadFileResponse> {
    const { buffer, filename, mimetype } = dto;

    try {
      // Upload to storage (S3 or local based on config)
      const storage = getStorage();
      const result = await storage.upload(buffer, filename, mimetype);

      // TODO: Enable database metadata tracking when ready
      // Save metadata to database
      // const fileRecord = await fileRepository.createFileRecord({
      //   filename: result.key,
      //   originalFilename: filename,
      //   mimeType: result.finalMimeType || mimetype,
      //   size: buffer.length,
      //   storageType: result.bucket ? "s3" : "local",
      //   storagePath: result.location,
      // });

      logger.info(
        `File uploaded successfully: ${filename} (${buffer.length} bytes)`
      );

      return {
        message: "File uploaded successfully",
        data: result,
        fileInfo: {
          originalName: filename,
          detectedMimeType: result.detectedMimeType,
          finalMimeType: result.finalMimeType,
          size: buffer.length,
        },
      };
    } catch (error) {
      logger.error("File upload service error:", error);
      throw error;
    }
  }

  /**
   * Download a file from storage
   *
   * @param dto - Download file data transfer object
   * @returns Download result with file buffer and metadata
   */
  async downloadFile(dto: DownloadFileDTO): Promise<DownloadResult> {
    const { fileName } = dto;

    try {
      // Get file from storage
      const storage = getStorage();
      const result = await storage.download(fileName);

      logger.info(`File downloaded successfully: ${fileName}`);

      return result;
    } catch (error) {
      logger.error("File download service error:", error);
      throw error;
    }
  }

  /**
   * Generate batch presigned URLs for multiple files
   *
   * @param dto - Generate presigned URLs data transfer object
   * @returns Presigned URLs and metadata
   */
  async generateBatchPresignedUrls(
    dto: GeneratePresignedUrlsDTO
  ): Promise<GeneratePresignedUrlsResponse> {
    const { keys, expiresInMinutes, validateExistence } = dto;

    try {
      // Validate input
      if (!keys || !Array.isArray(keys) || keys.length === 0) {
        throw new Error("keys array is required and must not be empty");
      }

      if (keys.length > 100) {
        throw new Error("Maximum 100 keys allowed per request");
      }

      if (expiresInMinutes <= 0 || expiresInMinutes > 43200) {
        throw new Error("Expiration time must be between 1 minute and 30 days");
      }

      // Generate presigned URLs
      const storage = getStorage();
      const result = await storage.generateBatchPresignedUrls(
        keys,
        expiresInMinutes,
        validateExistence
      );

      logger.info(
        `Generated ${
          Object.keys(result.urls).length
        } presigned URLs (${expiresInMinutes} minutes)`
      );

      return {
        urls: result.urls,
        expiresIn: `${expiresInMinutes} minutes`,
        validated: validateExistence,
        ...(validateExistence && { metadata: result.metadata }),
      };
    } catch (error) {
      logger.error("Generate presigned URLs service error:", error);
      throw error;
    }
  }

  /**
   * Delete a file from storage
   *
   * @param fileName - Name/key of the file to delete
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      const storage = getStorage();
      await storage.delete(fileName);

      // TODO: Enable database metadata cleanup when ready
      // Delete metadata from database
      // await fileRepository.deleteFileByPath(fileName);

      logger.info(`File deleted successfully: ${fileName}`);
    } catch (error) {
      logger.error("File deletion service error:", error);
      throw error;
    }
  }

  /**
   * Generate a single presigned URL for a file
   *
   * @param fileName - Name/key of the file
   * @param expiresInMinutes - URL expiration time in minutes
   * @returns Presigned URL
   */
  async generatePresignedUrl(
    fileName: string,
    expiresInMinutes: number = 30
  ): Promise<string> {
    try {
      if (expiresInMinutes <= 0 || expiresInMinutes > 43200) {
        throw new Error("Expiration time must be between 1 minute and 30 days");
      }

      const storage = getStorage();
      const url = await storage.generatePresignedUrl(
        fileName,
        expiresInMinutes
      );

      logger.info(`Generated presigned URL for: ${fileName}`);

      return url;
    } catch (error) {
      logger.error("Generate presigned URL service error:", error);
      throw error;
    }
  }

  /**
   * List files with pagination (if database is enabled)
   *
   * @param limit - Maximum number of files to return
   * @param offset - Number of files to skip
   * @returns List of file records
   */
  async listFiles(limit: number = 10, offset: number = 0) {
    try {
      // TODO: Implement when database is enabled
      // const files = await fileRepository.listFiles(limit, offset);
      // return files;

      logger.warn("List files not implemented - database is disabled");
      return [];
    } catch (error) {
      logger.error("List files service error:", error);
      throw error;
    }
  }

  /**
   * Get file metadata by ID (if database is enabled)
   *
   * @param fileId - ID of the file
   * @returns File record or null
   */
  async getFileById(fileId: string) {
    try {
      // TODO: Implement when database is enabled
      // const file = await fileRepository.getFileById(fileId);
      // return file;

      logger.warn("Get file by ID not implemented - database is disabled");
      return null;
    } catch (error) {
      logger.error("Get file by ID service error:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const fileService = new FileService();

export default FileService;
