// Shared helpers for the file-service Mongo→Postgres import script.
// Mirrors data_board/scripts/lib/import-helpers.ts so the two services
// behave the same way during a migration window.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** Throws with a clear message if an env var is missing or empty. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (no fallback). Set it before running this script.`);
  return v;
}

export const DRY_RUN = process.argv.includes("--dry-run");

/** Strip credentials and query string from a URL for safe console logging. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const creds = u.username ? `${u.username}:***@` : "";
    return `${u.protocol}//${creds}${u.host}${u.pathname}`;
  } catch {
    return raw.replace(/:[^:@/]+@/, ":***@");
  }
}

/** Coerces a value into a Date or returns null. */
export function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Same as toDate but defaults to `new Date()` for NOT NULL columns whose
 *  source row was missing the field. Documented quirk per playbook §7 #8 —
 *  we preserve "now" for missing created_at/updated_at to match the original
 *  JS migration script. Fix in a follow-up by allowing null in the schema. */
export function toDateOrNow(val: unknown): Date {
  return toDate(val) ?? new Date();
}

/**
 * Deterministic UUID derived from a Mongo `_id`. Same input always produces
 * the same UUID — required so re-running the migration ON CONFLICT (id) DO
 * NOTHING is idempotent (the original script used `crypto.randomUUID()` and
 * duplicated rows on every re-run; playbook §7 #3).
 *
 * Uses RFC 4122 UUIDv5 with the URL namespace.
 */
const URL_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export function uuidFromMongoId(mongoId: unknown): string {
  if (mongoId === null || mongoId === undefined) {
    throw new Error("uuidFromMongoId: source _id is null/undefined");
  }
  const idStr = typeof mongoId === "string" ? mongoId : String(mongoId);
  if (!idStr) throw new Error("uuidFromMongoId: empty _id");
  const namespaceBytes = Buffer.from(URL_NAMESPACE.replace(/-/g, ""), "hex");
  const nameBytes = Buffer.from(idStr, "utf8");
  const hash = createHash("sha1").update(namespaceBytes).update(nameBytes).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;       // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80;       // variant
  return [
    hash.subarray(0, 4).toString("hex"),
    hash.subarray(4, 6).toString("hex"),
    hash.subarray(6, 8).toString("hex"),
    hash.subarray(8, 10).toString("hex"),
    hash.subarray(10, 16).toString("hex"),
  ].join("-");
}

export type ImportStats = {
  inserted: number;
  skipped: number;
  processed: number;
  total: number;
};

export function newStats(total: number): ImportStats {
  return { inserted: 0, skipped: 0, processed: 0, total };
}

export function logProgress(label: string, stats: ImportStats): void {
  const pct = stats.total > 0 ? ((stats.processed / stats.total) * 100).toFixed(1) : "?";
  process.stdout.write(
    `\r  [${label}] ${stats.processed}/${stats.total} (${pct}%) — inserted: ${stats.inserted}, skipped: ${stats.skipped}    `,
  );
}

// ─── Checkpoint / resume ──────────────────────────────────────────────────────
// Per playbook §5.8: persist last successfully-flushed _id per (collection)
// so a crash on row N doesn't force restart from 0. The file lives at the repo
// root; .gitignored. Delete it to force a full re-import.

const CHECKPOINT_FILE = path.resolve(process.cwd(), ".migration-checkpoint.json");

export type CheckpointEntry = {
  /** _id.toString() of the last doc that was successfully flushed. */
  lastId: string;
  /** True if the cursor finished and the collection is fully imported. */
  done: boolean;
  inserted: number;
  skipped: number;
  /** ISO timestamp of last update — useful when staring at a stuck import. */
  updatedAt: string;
};

export type Checkpoint = Record<string, CheckpointEntry>;

export function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8")) as Checkpoint;
  } catch (err) {
    console.warn(`⚠ checkpoint file at ${CHECKPOINT_FILE} is unreadable, ignoring: ${(err as Error).message}`);
    return {};
  }
}

export function saveCheckpoint(cp: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

/**
 * Build the Mongo `_id` filter for resuming after `lastId`. Pass the first
 * sample doc from the collection so we can detect whether `_id` is an
 * ObjectId (BSON) or a string and wrap accordingly. Without the sample,
 * falls back to the raw string form (works for string-id collections only).
 */
export function resumeFilter(lastId: string | null, sampleDoc: { _id?: unknown } | null): Record<string, unknown> {
  if (!lastId) return {};
  const sample = sampleDoc?._id;
  const isObjectId = !!sample && typeof sample === "object" && (sample as { _bsontype?: string })._bsontype === "ObjectID"
    || !!sample && typeof sample === "object" && (sample as { constructor?: { name?: string } }).constructor?.name === "ObjectId";
  if (isObjectId) {
    const { ObjectId } = require("mongodb");
    return { _id: { $gt: new ObjectId(lastId) } };
  }
  return { _id: { $gt: lastId } };
}
