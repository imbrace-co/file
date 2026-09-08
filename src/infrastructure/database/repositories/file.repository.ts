import { getDatabase } from "./factory";
import { FileRecord, NewFileRecord, FindOptions } from "./types";

/**
 * Repository layer for file metadata
 * Uses the unified database interface - works with any database type
 */
export class FileRepository {
  private get db() {
    return getDatabase();
  }

  /**
   * Create a new file record in the database
   */
  async createFileRecord(data: NewFileRecord): Promise<FileRecord> {
    const result = await this.db.insert<NewFileRecord>("files", data);
    return result[0] as FileRecord;
  }

  /**
   * Get a file record by ID
   */
  async getFileRecord(id: string): Promise<FileRecord | null> {
    return await this.db.findFirst<FileRecord>("files", { id });
  }

  /**
   * Get a file record by filename
   */
  async getFileRecordByFilename(filename: string): Promise<FileRecord | null> {
    return await this.db.findFirst<FileRecord>("files", { filename });
  }

  /**
   * Update a file record
   */
  async updateFileRecord(
    id: string,
    data: Partial<NewFileRecord>
  ): Promise<FileRecord | null> {
    const result = await this.db.update<FileRecord>("files", { id }, data);
    return result[0] || null;
  }

  /**
   * Delete a file record
   */
  async deleteFileRecord(id: string): Promise<boolean> {
    const count = await this.db.delete<FileRecord>("files", { id });
    return count > 0;
  }

  /**
   * List file records with optional filters and pagination
   */
  async listFileRecords(
    filters?: Partial<FileRecord>,
    options?: FindOptions
  ): Promise<FileRecord[]> {
    return await this.db.findMany<FileRecord>("files", filters, options);
  }

  /**
   * Get files by storage type
   */
  async getFilesByStorageType(
    storageType: "s3" | "local",
    options?: FindOptions
  ): Promise<FileRecord[]> {
    return await this.db.findMany<FileRecord>(
      "files",
      { storageType },
      options
    );
  }

  /**
   * Count total files (for pagination)
   */
  async countFiles(filters?: Partial<FileRecord>): Promise<number> {
    const files = await this.db.findMany<FileRecord>("files", filters);
    return files.length;
  }
}

// Export a singleton instance
export const fileRepository = new FileRepository();

export default fileRepository;
