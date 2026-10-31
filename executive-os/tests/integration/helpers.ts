import { withTenant, withoutTenant, q, one, pool, type Tx } from '@/lib/db';
export async function tenants() { const c = await pool().connect(); try { await c.query('BEGIN'); const out: Record<string, string> = {};
  // tenants table is RLS-protected; resolve ids via the membership helper for known demo users
  for (const email of ['ceo@mips.demo', 'cfo@acme.demo']) { const u = await c.query('SELECT id FROM users WHERE lower(email) = $1', [email]); const m = await c.query('SELECT * FROM auth_user_memberships($1)', [u.rows[0].id]); for (const r of m.rows) out[r.tenant_code] = r.tenant_id; }
  await c.query('COMMIT'); return out; } finally { c.release(); } }
export async function userId(email: string) { return withoutTenant(async (t) => (await one<any>(t, 'SELECT id FROM users WHERE lower(email) = $1', [email]))!.id as string); }
export const as = (tenantId: string, userId: string | null = null) => <T>(fn: (t: Tx) => Promise<T>) => withTenant({ tenantId, userId }, fn);
export { q, one, withoutTenant };
