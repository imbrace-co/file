import { getStorage } from "../../infrastructure/storage/factory";
import { S3Adapter } from "../../infrastructure/storage/adapters/s3.adapter";
import {
  getFileUploadPath,
  getExtensionFromMime,
  getExtensionFromFilename,
  randomStr,
  SUPPORTED_BOARD_EXTS,
  SUPPORTED_FORM_EXTS,
} from "../../infrastructure/storage/upload-path.util";
import logger from "../../infrastructure/logging/logger";

// ─────────────────────────────────────────────
// Context → S3 prefix mapping (§1 of spec)
// ─────────────────────────────────────────────
const CONTEXT_PREFIX_MAP: Record<string, string> = {
  boards: "board",
  board: "board",                     // singular alias
  teams: "team",
  users: "user",
  contacts: "contact",
  conversation_messages: "contact",
  messages: "contact",                // alias for conversation_messages
  floor_plans: "floor_plan",
  account: "user",
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SingleUploadResult {
  url: string;
}

export interface BoardUploadFileResult {
  user_id: string;
  uploader: string;
  name: string;
  extension: string;
  sizeInBytes: number;
  uploadDate: string | null;
  url: string | null;
  key: string | null;
  error: string | null;
}

export interface FormUploadFileResult {
  name: string;
  extension: string;
  url: string | null;
  key: string | null;
  error: string | null;
}

export interface UploadFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

class UploadService {
  private getS3Adapter(): S3Adapter {
    const storage = getStorage();
    if (!(storage instanceof S3Adapter)) {
      throw new Error("S3 storage is required for this operation");
    }
    return storage;
  }

  /**
   * §1 — Single-file upload for a given context.
   * Returns the public S3 URL.
   */
  async singleContextUpload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    context: string,
    organizationId: string,
  ): Promise<SingleUploadResult> {
    const prefix = CONTEXT_PREFIX_MAP[context] ?? context;
    const extension =
      getExtensionFromFilename(originalName) || getExtensionFromMime(mimeType);

    const key = getFileUploadPath(prefix, organizationId, extension);
    const s3 = this.getS3Adapter();
    const result = await s3.uploadPublicFile(
      key,
      buffer,
      mimeType,
      originalName,
    );

    logger.info(`Single upload [${context}]: ${key}`);
    return { url: result.Location };
  }

  /**
   * §2 — Multiple board attachment upload (max 10 files).
   * Returns an array of results (including error entries for invalid files).
   */
  async boardMultiUpload(
    files: UploadFileInput[],
    organizationId: string,
    userId: string,
    uploaderName: string,
  ): Promise<BoardUploadFileResult[]> {
    if (files.length > 10) {
      throw Object.assign(new Error("maximum 10 files are allowed"), {
        code: 1,
      });
    }

    const s3 = this.getS3Adapter();
    const results: BoardUploadFileResult[] = [];

    for (const file of files) {
      const extension = getExtensionFromFilename(file.originalName);
      const baseName = file.originalName.replace(/\.[^/.]+$/, "");

      if (!SUPPORTED_BOARD_EXTS.has(extension)) {
        results.push({
          user_id: userId,
          uploader: uploaderName,
          name: baseName,
          extension,
          sizeInBytes: 0,
          uploadDate: null,
          url: null,
          key: null,
          error: `unsupported file type ${extension}`,
        });
        continue;
      }

      try {
        const key = getFileUploadPath("board", organizationId, extension);
        const uploadResult = await s3.uploadPublicFile(
          key,
          file.buffer,
          file.mimeType,
          file.originalName,
        );

        results.push({
          user_id: userId,
          uploader: uploaderName,
          name: baseName,
          extension,
          sizeInBytes: file.buffer.length,
          uploadDate: new Date().toISOString(),
          url: uploadResult.Location,
          key: uploadResult.Key,
          error: null,
        });
      } catch (err) {
        results.push({
          user_id: userId,
          uploader: uploaderName,
          name: baseName,
          extension,
          sizeInBytes: file.buffer.length,
          uploadDate: null,
          url: null,
          key: null,
          error: (err as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * §3 — Public form file upload (no auth, max 10 files, no json extension).
   */
  async formFileUpload(
    files: UploadFileInput[],
  ): Promise<FormUploadFileResult[]> {
    if (files.length > 10) {
      throw Object.assign(new Error("maximum 10 files are allowed"), {
        code: 1,
      });
    }

    const s3 = this.getS3Adapter();
    const results: FormUploadFileResult[] = [];

    for (const file of files) {
      const extension = getExtensionFromFilename(file.originalName);
      const baseName = file.originalName.replace(/\.[^/.]+$/, "");

      if (!SUPPORTED_FORM_EXTS.has(extension)) {
        results.push({
          name: baseName,
          extension,
          url: null,
          key: null,
          error: `unsupported file type ${extension}`,
        });
        continue;
      }

      try {
        const key = `form/files/file_${randomStr(26)}.${extension}`;
        const uploadResult = await s3.uploadPublicFile(
          key,
          file.buffer,
          file.mimeType,
          file.originalName,
        );

        results.push({
          name: baseName,
          extension,
          url: uploadResult.Location,
          key: uploadResult.Key,
          error: null,
        });
      } catch (err) {
        results.push({
          name: baseName,
          extension,
          url: null,
          key: null,
          error: (err as Error).message,
        });
      }
    }

    return results;
  }
}

export const uploadService = new UploadService();
export default UploadService;
