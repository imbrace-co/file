import * as path from "path";

/**
 * Supported image file extensions
 */
export const SUPPORTED_IMAGE_EXTS = new Set([
  "gif",
  "tiff",
  "tif",
  "svg",
  "jpg",
  "jpeg",
  "png",
]);

/**
 * Supported document file extensions (for board / form uploads)
 */
export const SUPPORTED_DOC_EXTS = new Set([
  "txt",
  "ai",
  "psd",
  "csv",
  "doc",
  "docx",
  "pdf",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "mp4",
  "json",
]);

/**
 * All supported extensions for board attachment uploads (images + docs)
 */
export const SUPPORTED_BOARD_EXTS = new Set([
  ...SUPPORTED_IMAGE_EXTS,
  ...SUPPORTED_DOC_EXTS,
]);

/**
 * Supported extensions for public form uploads (images + docs EXCEPT json)
 */
export const SUPPORTED_FORM_EXTS = new Set(
  [...SUPPORTED_IMAGE_EXTS, ...SUPPORTED_DOC_EXTS].filter((e) => e !== "json"),
);

/**
 * Generate a random alphanumeric string of the given length
 */
export function randomStr(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate an S3 key for a file upload.
 *
 * Pattern: `{prefix}/{organizationId}/file_{26-char-random}.{extension}`
 */
export function getFileUploadPath(
  prefix: string,
  organizationId: string,
  extension: string,
): string {
  return `${prefix}/${organizationId}/file_${randomStr(26)}.${extension}`;
}

/**
 * Get file extension from a MIME type string.
 * Falls back to a built-in map if mime-types lookup fails.
 */
export function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "text/plain": "txt",
    "text/csv": "csv",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "application/json": "json",
    "application/zip": "zip",
    "image/ai": "ai",
    "image/vnd.adobe.photoshop": "psd",
  };

  return mimeMap[mimeType.toLowerCase()] || "bin";
}

/**
 * Get extension from a filename string.
 */
export function getExtensionFromFilename(filename: string): string {
  return path.extname(filename).replace(".", "").toLowerCase();
}
