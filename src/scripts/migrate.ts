import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const dbType = process.env.DB_TYPE ?? "postgres";
  if (dbType !== "postgres") {
    console.log(`[migrate] DB_TYPE=${dbType} — skipping (only postgres migrations are managed)`);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set; migrate aborted");

  const pool = new Pool({ connectionString: url, max: 1 });
  // drizzle-orm beta no longer accepts a bare Pool positionally — it must be
  // passed as { client }, otherwise drizzle spins up its own default client
  // pointed at localhost:5432 and ignores DATABASE_URL.
  const db = drizzle({ client: pool });

  console.log("[migrate] applying drizzle migrations from ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done");

  await pool.end();
}

main().catch((e) => {
  // Non-fatal: a migration failure (e.g. a baseline re-applied against an
  // already-populated DB) must not block the service from starting. Log
  // loudly and exit 0 so the `migrate && app` chain still launches the app.
  console.error("[migrate] failed (continuing startup anyway):", e);
  process.exit(0);
});
