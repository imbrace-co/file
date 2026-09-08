#!/usr/bin/env tsx
/**
 * Mongo → Postgres data import for file-service.
 *
 * Reads the legacy MongoDB `fileservice` database and writes into the
 * Postgres tables drizzle-kit owns (`files`, `financial_files`). The schema
 * is `src/infrastructure/database/schemas/postgres.schema.ts` — column
 * types are inferred from there.
 *
 * Replaces scripts/migrate-mongo-to-postgres.js, which had three blocking
 * bugs flagged in DRIZZLE_PLAYBOOK.md:
 *  1. hardcoded MONGO_URI fallback to dev (silent prod→dev cross-write risk)
 *  2. crypto.randomUUID() per row (re-runs duplicate every record)
 *  3. row-by-row INSERTs (~20× slower than batch)
 *
 * Usage:
 *   MONGO_URI='mongodb+srv://…' \
 *   POSTGRES_URL='postgres://…' \
 *   pnpm import:mongo                # real run
 *   pnpm import:mongo -- --dry-run   # print redacted config and exit
 */

import { MongoClient, type Collection, type Document } from "mongodb";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/infrastructure/database/schemas/postgres.schema";
import {
  requireEnv,
  redactUrl,
  toDateOrNow,
  uuidFromMongoId,
  newStats,
  logProgress,
  loadCheckpoint,
  saveCheckpoint,
  resumeFilter,
  DRY_RUN,
  type ImportStats,
  type Checkpoint,
} from "./lib/import-helpers";

const MONGO_URI = requireEnv("MONGO_URI");
const POSTGRES_URL = requireEnv("POSTGRES_URL");
const MONGO_DB = process.env.MONGO_DB ?? "fileservice";
const ORG_FILTER = process.env.ORG_FILTER || null;
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 1000);

console.log("Config:");
console.log(`  MONGO_URI    = ${redactUrl(MONGO_URI)}`);
console.log(`  POSTGRES_URL = ${redactUrl(POSTGRES_URL)}`);
console.log(`  MONGO_DB     = ${MONGO_DB}`);
console.log(`  ORG_FILTER   = ${ORG_FILTER ?? "(none — full import)"}`);
console.log(`  BATCH_SIZE   = ${BATCH_SIZE}`);
console.log(`  DRY_RUN      = ${DRY_RUN}`);

// ─── Mappers ──────────────────────────────────────────────────────────────────
// `files.id` is a `uuid PK default gen_random_uuid()`. Mongo's _id is usually
// an ObjectId (24-char hex), which doesn't fit the uuid type — we hash it
// with UUIDv5 instead so the mapping is deterministic and re-runs converge.

const mapFile = (doc: Document): typeof schema.files.$inferInsert => ({
  id: uuidFromMongoId(doc._id),
  filename: doc.filename ?? "",
  originalFilename: doc.originalFilename ?? doc.filename ?? "",
  mimeType: doc.mimeType ?? "application/octet-stream",
  size: doc.size ?? 0,
  storageType: doc.storageType === "local" ? "local" : "s3",
  storagePath: doc.storagePath ?? "",
  uploadedAt: toDateOrNow(doc.uploadedAt),
  updatedAt: toDateOrNow(doc.updatedAt),
});

// `financial_files.id` is varchar(36). Mongo source rows may carry a UUID
// string in `id` already; if not, fall back to ObjectId hex (24 chars fits).
const mapFinancialFile = (doc: Document): typeof schema.financialFiles.$inferInsert => {
  const rawId = doc.id ?? (doc._id?.toString?.() ?? String(doc._id));
  const id = String(rawId).substring(0, 36);
  if (!id) throw new Error(`financial_files row has no usable id: ${JSON.stringify(doc).slice(0, 120)}`);
  return {
    id,
    file_name: doc.file_name ?? doc.fileName ?? "",
    original_url: doc.original_url ?? doc.originalUrl ?? "",
    updated_link: doc.updated_link ?? doc.updatedLink ?? null,
    organization_id: doc.organization_id ?? doc.organizationId ?? "",
    created_at: toDateOrNow(doc.created_at ?? doc.createdAt),
    updated_at: toDateOrNow(doc.updated_at ?? doc.updatedAt),
  };
};

type Spec<T extends keyof typeof schema> = {
  collection: string;
  table: T;
  mapper: (doc: Document) => any;
};

const SPECS: Spec<keyof typeof schema>[] = [
  { collection: "files", table: "files", mapper: mapFile },
  { collection: "financial_files", table: "financialFiles", mapper: mapFinancialFile },
];

const orgQuery = ORG_FILTER ? { organization_id: ORG_FILTER } : {};

// ─── Insert path ──────────────────────────────────────────────────────────────

async function flushBatch(
  db: ReturnType<typeof drizzle>,
  table: any,
  rows: any[],
  stats: ImportStats,
  label: string,
): Promise<void> {
  try {
    await db.insert(table).values(rows).onConflictDoNothing();
    stats.inserted += rows.length;
  } catch {
    // Batch insert failed — usually one bad doc poisons the rest. Fall back
    // to per-row inserts so we can isolate.
    for (const row of rows) {
      try {
        await db.insert(table).values(row).onConflictDoNothing();
        stats.inserted++;
      } catch (e2: any) {
        stats.skipped++;
        if (stats.skipped <= 10) {
          const msg = String(e2?.message ?? e2).split("\n")[0];
          console.warn(`\n  ⚠ skipped row in ${label}: ${msg}`);
        }
      }
    }
  }
  stats.processed += rows.length;
}

async function importCollection(
  mongoColl: Collection,
  spec: Spec<keyof typeof schema>,
  db: ReturnType<typeof drizzle>,
  checkpoint: Checkpoint,
): Promise<void> {
  const table = (schema as any)[spec.table];
  const mapper = spec.mapper;
  const label = `${MONGO_DB}.${spec.collection}→${spec.table}`;
  const cpKey = `${MONGO_DB}.${spec.collection}`;
  const cpEntry = checkpoint[cpKey];

  if (cpEntry?.done) {
    console.log(`\n[${label}] already complete per checkpoint (inserted=${cpEntry.inserted}, skipped=${cpEntry.skipped}) — skip. Delete .migration-checkpoint.json to force re-run.`);
    return;
  }

  const sampleDoc = await mongoColl.findOne(orgQuery, { sort: { _id: 1 } });
  const total = await mongoColl.countDocuments(orgQuery);
  if (total === 0) {
    console.log(`\n[${label}] 0 docs — skip`);
    checkpoint[cpKey] = { lastId: cpEntry?.lastId ?? "", done: true, inserted: 0, skipped: 0, updatedAt: new Date().toISOString() };
    saveCheckpoint(checkpoint);
    return;
  }

  const resumeFromId = cpEntry?.lastId ?? null;
  const filter = { ...orgQuery, ...resumeFilter(resumeFromId, sampleDoc) };
  console.log(`\n[${label}] ${total} docs (batch=${BATCH_SIZE})${resumeFromId ? `, resuming after _id ${resumeFromId}` : ""}`);

  const stats = newStats(total);
  stats.inserted = cpEntry?.inserted ?? 0;
  stats.skipped = cpEntry?.skipped ?? 0;
  stats.processed = stats.inserted + stats.skipped;

  const cursor = mongoColl.find(filter).sort({ _id: 1 }).batchSize(BATCH_SIZE);
  let buffer: { row: any; sourceId: string }[] = [];

  const persist = (lastId: string, done: boolean) => {
    checkpoint[cpKey] = { lastId, done, inserted: stats.inserted, skipped: stats.skipped, updatedAt: new Date().toISOString() };
    saveCheckpoint(checkpoint);
  };

  for await (const doc of cursor) {
    const sourceId = String(doc._id);
    let row: any;
    try {
      row = mapper(doc);
    } catch (err: any) {
      stats.skipped++;
      if (stats.skipped <= 10) {
        console.warn(`\n  ⚠ mapper failed for ${doc._id}: ${String(err?.message ?? err).split("\n")[0]}`);
      }
      // Mapper failures still advance the checkpoint — otherwise a permanently
      // bad row blocks every subsequent re-run on the same _id.
      persist(sourceId, false);
      continue;
    }
    buffer.push({ row, sourceId });
    if (buffer.length >= BATCH_SIZE) {
      const lastId = buffer[buffer.length - 1]!.sourceId;
      await flushBatch(db, table, buffer.map((b) => b.row), stats, label);
      logProgress(label, stats);
      persist(lastId, false);
      buffer = [];
    }
  }
  if (buffer.length) {
    const lastId = buffer[buffer.length - 1]!.sourceId;
    await flushBatch(db, table, buffer.map((b) => b.row), stats, label);
    logProgress(label, stats);
    persist(lastId, true);
  } else {
    persist(cpEntry?.lastId ?? "", true);
  }
  process.stdout.write("\n");
  console.log(`  ✓ ${label}: inserted=${stats.inserted}, skipped=${stats.skipped}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (DRY_RUN) {
    console.log("\n--dry-run set — config printed above, exiting before connecting. Re-run without --dry-run to perform the import.");
    return;
  }

  const checkpoint = loadCheckpoint();
  if (Object.keys(checkpoint).length > 0) {
    console.log(`\nResuming from .migration-checkpoint.json (${Object.keys(checkpoint).length} entries). Delete the file to force a full re-import.`);
  }

  console.log("\nConnecting to MongoDB...");
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();

  console.log("Connecting to PostgreSQL via drizzle ORM...");
  const pool = new Pool({ connectionString: POSTGRES_URL });
  await pool.query("SELECT 1");
  const db = drizzle({ client: pool, schema });

  const t0 = Date.now();
  try {
    const mdb = mongo.db(MONGO_DB);
    const colls = await mdb.listCollections().toArray();
    const collNames = new Set(colls.map((c) => c.name));
    console.log(`\n=== Database: ${MONGO_DB} (${collNames.size} collections present) ===`);

    for (const spec of SPECS) {
      if (!collNames.has(spec.collection)) {
        console.log(`  [${MONGO_DB}.${spec.collection}] not present — skip`);
        continue;
      }
      await importCollection(mdb.collection(spec.collection), spec, db, checkpoint);
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Import complete in ${dt}s`);
  } finally {
    await mongo.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Import failed:", err);
  process.exit(1);
});
