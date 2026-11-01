import { Pool, PoolClient, types } from 'pg';
import { logger } from './logger';

// Keep DATE as 'YYYY-MM-DD' strings (no timezone conversion); NUMERIC stays string (decimal-safe).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => v); // int8 as string

const g = globalThis as unknown as { __mipsPool?: Pool };

export function pool(): Pool {
  if (!g.__mipsPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured');
    g.__mipsPool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10), statement_timeout: 30000 });
    g.__mipsPool.on('error', (e) => logger.error('pg_pool_error', { error: e.message }));
  }
  return g.__mipsPool;
}

export type Tx = PoolClient;
export interface TenantCtx { tenantId: string; userId: string | null }

/**
 * Run fn inside a transaction bound to one tenant. Postgres RLS uses
 * app.tenant_id, so queries cannot read or write other tenants' rows even if
 * a WHERE clause is forgotten.
 */
export async function withTenant<T>(ctx: TenantCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)", [ctx.tenantId, ctx.userId ?? '']);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Queries that are NOT tenant scoped (users, sessions, login attempts). */
export async function withoutTenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function q<T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await tx.query(sql, params as any[]);
  return r.rows as T[];
}
export async function one<T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await tx.query(sql, params as any[]);
  return (r.rows[0] as T) ?? null;
}
