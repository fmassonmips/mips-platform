/**
 * Provision and seed the DEMO tenants.
 *   npm run db:seed            # create if missing
 *   npm run db:reset-demo      # purge demo tenant data and regenerate
 * Uses the OWNER connection. Never runs against non-demo tenants.
 */
import { Client } from 'pg';
import { loadEnv } from './env';
import { provisionTenant, upsertUser, addMembership } from '../src/lib/services/provision';
import { seedDemoTenant } from '../src/lib/demo/seed';
import { seedSecondaryTenant } from '../src/lib/demo/seed-secondary';

loadEnv();
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-Passw0rd-2026';
const DEMO_USERS = [
  ['ceo@mips.demo', 'Demo CEO', 'ceo', 'EXEC'], ['cfo@mips.demo', 'Demo CFO', 'cfo', 'FIN'], ['finance@mips.demo', 'Demo Finance Manager', 'finance_manager', 'FIN'],
  ['analyst@mips.demo', 'Demo Analyst', 'analyst', 'FIN'], ['auditor@mips.demo', 'Demo Auditor', 'auditor', 'RISK'], ['admin@mips.demo', 'Demo Administrator', 'admin', 'TECH'], ['viewer@mips.demo', 'Demo Viewer', 'viewer', 'OPS'], ['chair@mips.demo', 'Demo Board Chair', 'board_chair', 'EXEC'],
] as const;

export async function seedAll(url: string, opts: { reset: boolean; scale?: number; log?: (s: string) => void }) {
  const log = opts.log ?? console.log;
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = await provisionTenant(c as any, { code: 'mips-demo', name: 'MIPSIT Digital Ltd (DEMO)', legalName: 'MIPSIT Digital Ltd — DEMO DATASET', isDemo: true, settings: { mfa_required_roles: [], mfa_policy_note: 'DEMO tenant: MFA optional so demo accounts work; production default requires MFA for admin.' } });
    const users: Record<string, string> = {};
    for (const [email, name, role, dept] of DEMO_USERS) {
      const id = await upsertUser(c as any, email, name, DEMO_PASSWORD);
      await addMembership(c as any, tenantId, id, role, dept);
      users[role === 'finance_manager' ? 'finance' : role] = id;
    }
    const existing = await c.query("SELECT count(*)::int AS n FROM merchants WHERE tenant_id = $1", [tenantId]);
    if (existing.rows[0].n > 0 && !opts.reset) { log('demo tenant already seeded (use --reset to regenerate)'); await c.query('COMMIT'); return tenantId; }
    if (existing.rows[0].n > 0) { await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]); await c.query('SELECT purge_demo_tenant_data($1)', [tenantId]); log('purged demo tenant data'); }
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const t0 = Date.now();
    const r = await seedDemoTenant(c as any, tenantId, users, { scale: opts.scale });
    log(`seeded mips-demo: ${r.transactions} transactions, ${r.merchants} merchants in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    // Secondary tenant — demonstrates multi-tenant isolation
    const t2 = await provisionTenant(c as any, { code: 'acme-pay-demo', name: 'Acme Pay PSP (DEMO)', isDemo: true, baseCurrency: 'MUR', fyStartMonth: 1, settings: { mfa_required_roles: [] } });
    const u2 = await upsertUser(c as any, 'cfo@acme.demo', 'Acme Demo CFO', DEMO_PASSWORD);
    await addMembership(c as any, t2, u2, 'cfo');
    await addMembership(c as any, t2, users.admin, 'admin');
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [t2]);
    const ex2 = await c.query('SELECT count(*)::int AS n FROM merchants WHERE tenant_id = $1', [t2]);
    if (ex2.rows[0].n > 0) await c.query('SELECT purge_demo_tenant_data($1)', [t2]);
    await seedSecondaryTenant(c as any, t2, u2);
    log('seeded acme-pay-demo');
    await c.query('COMMIT');
    return tenantId;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  seedAll(process.env.DATABASE_OWNER_URL!, { reset }).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
