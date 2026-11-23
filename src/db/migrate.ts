import fs from "node:fs/promises";
import path from "node:path";
import { getPool } from "../lib/db";
import { getEnv } from "../lib/env";
import { hashPassword } from "../lib/crypto";

const MIGRATION_LOCK_ID = 74839201;

export async function runMigrations(): Promise<void> {
  const env = getEnv();
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.warn(
      "[migrate] WARNING: DATABASE_URL is not set in environment variables; falling back to default localhost."
    );
  } else {
    try {
      const parsedUrl = new URL(env.DATABASE_URL);
      console.log(
        `[migrate] Connecting to PostgreSQL at ${parsedUrl.hostname}:${parsedUrl.port || "5432"}${parsedUrl.pathname}`
      );
    } catch {
      console.log("[migrate] Connecting to PostgreSQL using configured DATABASE_URL");
    }
  }

  const pool = getPool();
  let client;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      client = await pool.connect();
      break;
    } catch (err) {
      if (attempt === 5) throw err;
      console.warn(`[migrate] PostgreSQL connection attempt ${attempt}/5 failed, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!client) throw new Error("Failed to acquire PostgreSQL client");

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
    const entries = await fs.readdir(migrationsDir);
    const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

    for (const file of sqlFiles) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [file]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] Applied migration ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    // Bootstrap initial superadmin if configured and none exists yet
    if (env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_PASSWORD) {
      const superadminCount = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE role = 'superadmin'"
      );
      if (Number(superadminCount.rows[0]?.count ?? "0") === 0) {
        const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, status, preferred_locale, video_editor_enabled)
           VALUES ($1, $2, $3, 'superadmin', 'active', 'es', true)
           ON CONFLICT (email) DO NOTHING`,
          [env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(), passwordHash, env.BOOTSTRAP_ADMIN_NAME]
        );
        console.log(`[migrate] Bootstrapped superadmin account: ${env.BOOTSTRAP_ADMIN_EMAIL}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log("[migrate] Done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] Failed:", err);
      process.exit(1);
    });
}
