import { getStorage } from "../../infrastructure/storage/factory";
import { S3Adapter } from "../../infrastructure/storage/adapters/s3.adapter";
import {
  getFileUploadPath,
  getExtensionFromMime,
} from "../../infrastructure/storage/upload-path.util";
import financialFileRepository, {
  FinancialFileRecord,
} from "../../infrastructure/database/repositories/financial-file.repository";
import config from "../../config";
import logger from "../../infrastructure/logging/logger";

export interface FinancialUploadFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

class FinancialFileService {
  private getS3Adapter(): S3Adapter {
    const storage = getStorage();
    if (!(storage instanceof S3Adapter)) {
      throw new Error("S3 storage is required for financial file uploads");
    }
    return storage;
  }

  /**
   * §5.1 — Upload financial file(s):
   * 1. Upload to S3 under `financial/{org_id}/file_{random}.{ext}`
   * 2. Save metadata record to DB
   * 3. Forward file list to AI backend
   */
  async upload(
    files: FinancialUploadFileInput[],
    organizationId: string,
  ): Promise<any> {
    const s3 = this.getS3Adapter();
    const uploadedFiles: { fileUrl: string; fileName: string }[] = [];

    for (const file of files) {
      const extension =
        file.originalName.split(".").pop()?.toLowerCase() ||
        getExtensionFromMime(file.mimeType);
      const key = getFileUploadPath("financial", organizationId, extension);

      const result = await s3.uploadPublicFile(
        key,
        file.buffer,
        file.mimeType,
        file.originalName,
      );

      // Save to DB
      await financialFileRepository.create({
        file_name: file.originalName,
        original_url: result.Location,
        organization_id: organizationId,
      });

      uploadedFiles.push({
        fileUrl: result.Location,
        fileName: file.originalName,
      });
    }

    // Forward to AI backend
    const backendUrl = config.backendUrl;
    if (backendUrl) {
      try {
        const aiResponse = await fetch(
          `${backendUrl}/v1/financial_documents/upload`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(uploadedFiles),
          },
        );
        if (aiResponse.ok) {
          return await aiResponse.json();
        }
      } catch (err) {
        logger.warn("AI backend forwarding failed:", err);
      }
    }

    return { message: "Files uploaded successfully", files: uploadedFiles };
  }

  /**
   * §5.2 — Get financial file by ID (org-scoped)
   */
  async getById(
    id: string,
    organizationId: string,
  ): Promise<FinancialFileRecord | null> {
    return financialFileRepository.findById(id, organizationId);
  }

  /**
   * §5.3 — Delete financial file from S3 + DB (org-scoped)
   */
  async delete(id: string, organizationId: string): Promise<void> {
    const record = await financialFileRepository.findById(id, organizationId);
    if (!record) {
      const error: any = new Error("File not found");
      error.statusCode = 404;
      throw error;
    }

    const s3 = this.getS3Adapter();
    // Extract S3 key from original_url or build from file_name
    // key format: financial/{org_id}/{file_name}
    const key = `financial/${organizationId}/${record.file_name}`;
    try {
      await s3.deleteFileByKey(key);
    } catch (err) {
      logger.warn(`S3 delete warning for key ${key}:`, err);
    }

    await financialFileRepository.deleteById(id, organizationId);
  }
}

export const financialFileService = new FinancialFileService();
export default FinancialFileService;
