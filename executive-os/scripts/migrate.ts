/**
 * Migration runner. Applies db/migrations/*.sql in order using the OWNER role.
 * - Numbered files < 900 are applied once (checksum recorded; a changed checksum aborts).
 * - Files >= 900 are "repeatable" (security/RLS) and re-applied on every run.
 * Usage: DATABASE_OWNER_URL=... tsx scripts/migrate.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Client } from 'pg';
import { loadEnv } from './env';

loadEnv();

export async function migrate(url = process.env.DATABASE_OWNER_URL!, log = console.log) {
  if (!url) throw new Error('DATABASE_OWNER_URL is required');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = path.join(__dirname, '..', 'db', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const repeatable = Number(file.slice(0, 3)) >= 900;
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [file]);
      if (rows.length && !repeatable) {
        if (rows[0].checksum !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)
           ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
          [file, checksum],
        );
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate().then(() => console.log('migrations complete')).catch((e) => { console.error(e); process.exit(1); });
}
