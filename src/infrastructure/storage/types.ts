/**
 * Storage adapter interface for file operations
 * Supports both S3 and local file system storage
 */
export interface UploadResult {
  key: string;
  location: string;
  etag?: string;
  bucket?: string;
  detectedMimeType?: string;
  finalMimeType?: string;
}

export interface DownloadResult {
  Body: Buffer;
  ContentType?: string;
  ContentLength?: number;
  LastModified?: Date;
  Key: string;
}

export interface BatchPresignedUrlResult {
  urls: { [key: string]: string };
  metadata?: { [key: string]: any };
}

export interface StorageAdapter {
  /**
   * Upload a file to storage
   */
  upload(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<UploadResult>;

  /**
   * Download a file from storage
   */
  download(filename: string): Promise<DownloadResult>;

  /**
   * Generate a presigned URL for file access
   */
  generatePresignedUrl(
    filename: string,
    expiresInMinutes: number
  ): Promise<string>;

  /**
   * Generate multiple presigned URLs in batch
   */
  generateBatchPresignedUrls(
    filenames: string[],
    expiresInMinutes: number,
    validateExistence?: boolean
  ): Promise<BatchPresignedUrlResult>;

  /**
   * Delete a file from storage
   */
  delete(filename: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(filename: string): Promise<boolean>;
}
