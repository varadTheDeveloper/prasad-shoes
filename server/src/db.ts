import pg from 'pg';
import { env } from './env';

// NUMERIC (amount) -> JS number; whole rupees with optional paise fit safely.
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  // All dates are worked out in India time (Asia/Kolkata).
  options: '-c timezone=Asia/Kolkata',
});

export type Db = pg.Pool | pg.PoolClient;

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool) {
  return db.query<T>(text, params);
}

/** Run fn inside one transaction. Rolls back on any error. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
