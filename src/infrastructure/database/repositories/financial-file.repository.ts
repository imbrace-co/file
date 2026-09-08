import { getDrizzleClient } from "../adapters/drizzle.adapter";
import config from "../../../config";

export interface NewFinancialFileRecord {
  file_name: string;
  original_url: string;
  updated_link?: string | null;
  organization_id: string;
}

export interface FinancialFileRecord {
  id: string;
  file_name: string;
  original_url: string;
  updated_link: string | null;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Repository for the financial_files table.
 * Uses Drizzle ORM directly against the active SQL database.
 */
export class FinancialFileRepository {
  private async getSchema() {
    const dbType = config.database.type;
    switch (dbType) {
      case "postgres":
        return await import("../schemas/postgres.schema");
      case "mysql":
        return await import("../schemas/mysql.schema");
      case "sqlite":
        return await import("../schemas/sqlite.schema");
      default:
        throw new Error(
          `FinancialFileRepository: unsupported db type ${dbType}`,
        );
    }
  }

  async create(data: NewFinancialFileRecord): Promise<FinancialFileRecord> {
    const db = getDrizzleClient();
    const schema = await this.getSchema();
    const { financialFiles } = schema;

    const id = crypto.randomUUID();
    const now = new Date();

    const [record] = await db
      .insert(financialFiles)
      .values({
        id,
        file_name: data.file_name,
        original_url: data.original_url,
        updated_link: data.updated_link ?? null,
        organization_id: data.organization_id,
        created_at: now,
        updated_at: now,
      } as any)
      .returning();

    return record as FinancialFileRecord;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<FinancialFileRecord | null> {
    const db = getDrizzleClient();
    const schema = await this.getSchema();
    const { financialFiles } = schema;
    const { eq, and } = await import("drizzle-orm");

    const result = await db
      .select()
      .from(financialFiles)
      .where(
        and(
          eq(financialFiles.id, id),
          eq(financialFiles.organization_id, organizationId),
        ),
      )
      .limit(1);

    return (result[0] as FinancialFileRecord) ?? null;
  }

  async deleteById(id: string, organizationId: string): Promise<boolean> {
    const db = getDrizzleClient();
    const schema = await this.getSchema();
    const { financialFiles } = schema;
    const { eq, and } = await import("drizzle-orm");

    const result = await db
      .delete(financialFiles)
      .where(
        and(
          eq(financialFiles.id, id),
          eq(financialFiles.organization_id, organizationId),
        ),
      )
      .returning();

    return result.length > 0;
  }
}

export const financialFileRepository = new FinancialFileRepository();
export default financialFileRepository;
