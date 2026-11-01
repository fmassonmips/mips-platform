/** Tenant provisioning: tenant row, system roles, permissions, base configuration. */
import type { Tx } from '../db';
import { one } from '../db';
import { PERMISSIONS, DEFAULT_ROLES } from '../auth/permissions';
import { hashPassword } from '../auth/password';

export const DEFAULT_SETTINGS = {
  revenue_recognition: 'agent_net',          // documented policy: MIPS acts as agent; revenue = MDR − wholesale
  revenue_policy_note: 'Agent (net) treatment pending formal accounting-policy approval by the CFO and external auditor.',
  revenue_recon_tolerance: '1',
  overhead_allocation: 'by_revenue',
  minimum_liquidity: '3000000',
  materiality_pct: '5',
  mfa_required_roles: ['admin'],
  margin_alert_threshold_pct: '10',
};
export const DEFAULT_FEATURES = { merchant_intelligence: true, decision_center: true, proof_center: true, strategy: true, ai_analyst: true, treasury: true, board_reporting: true, integrations: true };

export async function ensureGlobalCatalogues(tx: Tx) {
  for (const [code, [module, description]] of Object.entries(PERMISSIONS)) {
    await tx.query('INSERT INTO permissions (code, module, description) VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description', [code, module, description]);
  }
  const ccys: [string, string][] = [['MUR', 'Mauritian rupee'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'Pound sterling'], ['ZAR', 'South African rand'], ['INR', 'Indian rupee']];
  for (const [c, n] of ccys) await tx.query('INSERT INTO currencies (code, name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c, n]);
}

export async function provisionTenant(tx: Tx, t: { code: string; name: string; legalName?: string; isDemo: boolean; baseCurrency?: string; fyStartMonth?: number; settings?: object }): Promise<string> {
  await ensureGlobalCatalogues(tx);
  const row = await one<{ id: string }>(tx,
    `INSERT INTO tenants (code, name, legal_name, is_demo, base_currency, fiscal_year_start_month, settings, features)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [t.code, t.name, t.legalName ?? t.name, t.isDemo, t.baseCurrency ?? 'MUR', t.fyStartMonth ?? 7, JSON.stringify({ ...DEFAULT_SETTINGS, ...(t.settings ?? {}) }), JSON.stringify(DEFAULT_FEATURES)]);
  const tenantId = row!.id;
  await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  for (const [code, r] of Object.entries(DEFAULT_ROLES)) {
    const role = await one<{ id: string }>(tx, `INSERT INTO roles (tenant_id, code, name, description, is_system) VALUES ($1,$2,$3,$4,true)
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [tenantId, code, r.name, r.description]);
    for (const p of r.permissions) await tx.query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [tenantId, role!.id, p]);
  }
  return tenantId;
}

export async function upsertUser(tx: Tx, email: string, name: string, password: string): Promise<string> {
  const ph = await hashPassword(password);
  const r = await one<{ id: string }>(tx, `INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3)
    ON CONFLICT ((lower(email))) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [email, name, ph]);
  return r!.id;
}

export async function addMembership(tx: Tx, tenantId: string, userId: string, roleCode: string, department?: string) {
  await tx.query(`INSERT INTO memberships (tenant_id, user_id, role_id, department)
    SELECT $1, $2, id, $4 FROM roles WHERE tenant_id = $1 AND code = $3
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`, [tenantId, userId, roleCode, department ?? null]);
}
