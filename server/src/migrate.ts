// npm run migrate – runs every migrations/NNN_*.sql file once, in order.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { env } from './env';

async function main() {
  // Works from src/ (tsx) and dist/ (built)
  const dir = [resolve(__dirname, '../migrations'), resolve(process.cwd(), 'migrations')].find((d) => existsSync(d))!;
  const client = new pg.Client({ connectionString: env.migrateDatabaseUrl });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await client.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`Applying ${f} ... `);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [f]);
      await client.query('COMMIT');
      console.log('done');
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      throw e;
    }
  }
  console.log('Database is up to date.');
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
