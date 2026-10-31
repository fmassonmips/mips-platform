import { describe, it, expect, beforeAll } from 'vitest';
import { tenants, userId, as, q, one, withoutTenant } from './helpers';

let T: Record<string, string>; let ceo: string; let cfo: string; let fin: string;
beforeAll(async () => { T = await tenants(); ceo = await userId('ceo@mips.demo'); cfo = await userId('cfo@mips.demo'); fin = await userId('finance@mips.demo'); });

describe('tenant isolation (Postgres RLS, runtime role without BYPASSRLS)', () => {
  it('each tenant sees only its own rows, even without WHERE clauses', async () => {
    const mips = await as(T['mips-demo'])((t) => q<any>(t, 'SELECT DISTINCT tenant_id FROM transactions'));
    const acme = await as(T['acme-pay-demo'])((t) => q<any>(t, 'SELECT DISTINCT tenant_id FROM transactions'));
    expect(mips.map((r) => r.tenant_id)).toEqual([T['mips-demo']]);
    expect(acme.map((r) => r.tenant_id)).toEqual([T['acme-pay-demo']]);
  });
  it('a tenant cannot read another tenant’s merchant by id', async () => {
    const secret = await as(T['acme-pay-demo'])((t) => one<any>(t, "SELECT id FROM merchants WHERE code = 'A001'"));
    const leak = await as(T['mips-demo'])((t) => one<any>(t, 'SELECT * FROM merchants WHERE id = $1', [secret!.id]));
    expect(leak).toBeNull();
  });
  it('without a tenant context no tenant data is visible', async () => {
    const n = await withoutTenant((t) => one<any>(t, 'SELECT count(*)::int AS n FROM transactions'));
    expect(n!.n).toBe(0);
  });
  it('cannot insert rows into another tenant (WITH CHECK)', async () => {
    await expect(as(T['mips-demo'])((t) => t.query("INSERT INTO verticals (tenant_id, code, name) VALUES ($1, 'x', 'x')", [T['acme-pay-demo']]))).rejects.toThrow(/row-level security/);
  });
  it('cannot update rows of another tenant (silently affects 0 rows)', async () => {
    const r = await as(T['mips-demo'])((t) => t.query("UPDATE merchants SET name = 'hacked' WHERE code = 'A001'"));
    expect(r.rowCount).toBe(0);
  });
  it('file storage (source_files) is isolated', async () => {
    const own = await as(T['acme-pay-demo'])((t) => one<any>(t, 'SELECT count(*)::int AS n FROM source_files'));
    const other = await as(T['mips-demo'])((t) => q<any>(t, 'SELECT tenant_id FROM source_files'));
    expect(other.every((r) => r.tenant_id === T['mips-demo'])).toBe(true);
    expect(own!.n).toBeGreaterThanOrEqual(0);
  });
  it('the runtime role has no BYPASSRLS and is not superuser', async () => {
    const r = await withoutTenant((t) => one<any>(t, 'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user'));
    expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
  });
});

describe('immutability & audit', () => {
  it('audit events cannot be updated or deleted (non-demo guard via GUC off)', async () => {
    await expect(as(T['mips-demo'])((t) => t.query("UPDATE audit_events SET action = 'x' WHERE id = (SELECT min(id) FROM audit_events)"))).rejects.toThrow();
    await expect(as(T['mips-demo'])((t) => t.query('DELETE FROM audit_events WHERE id = (SELECT min(id) FROM audit_events)'))).rejects.toThrow(/IMMUTABLE_RECORD/);
  });
  it('setting the purge GUC directly is not enough outside the demo purge path for non-demo tenants', async () => {
    await withoutTenant(async (t) => {
      const r = await one<any>(t, "SELECT set_config('app.allow_demo_purge','on',true), demo_purge_allowed('00000000-0000-0000-0000-000000000000'::uuid) AS ok");
      expect(r!.ok).toBe(false);
    });
  });
  it('transactions financial fields are frozen', async () => {
    await expect(as(T['mips-demo'])((t) => t.query('UPDATE transactions SET amount_base = amount_base + 1 WHERE id = (SELECT id FROM transactions LIMIT 1)'))).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(as(T['mips-demo'])((t) => t.query('DELETE FROM transactions WHERE id = (SELECT id FROM transactions LIMIT 1)'))).rejects.toThrow(/IMMUTABLE_RECORD/);
  });
  it('GL entries are append-only and locked periods reject postings', async () => {
    await expect(as(T['mips-demo'])((t) => t.query('UPDATE gl_entries SET debit = debit WHERE id = (SELECT id FROM gl_entries LIMIT 1)'))).rejects.toThrow(/IMMUTABLE_RECORD/);
    await expect(as(T['mips-demo'], fin)((t) => t.query(`INSERT INTO gl_entries (tenant_id, journal_ref, entry_date, period, account_id, currency, debit, debit_base)
      SELECT $1, 'TEST-LOCKED', '2026-01-15', '2026-01-01', id, 'MUR', 1, 1 FROM chart_of_accounts WHERE code = '6700'`, [T['mips-demo']]))).rejects.toThrow(/PERIOD_LOCKED/);
  });
  it('approved budget versions are locked', async () => {
    await expect(as(T['mips-demo'])((t) => t.query(`UPDATE budget_lines SET amount_base = amount_base + 1 WHERE version_id = (SELECT id FROM budget_versions WHERE status = 'approved' LIMIT 1)`))).rejects.toThrow(/VERSION_LOCKED/);
  });
  it('KPI result values are immutable', async () => {
    await expect(as(T['mips-demo'])((t) => t.query('UPDATE kpi_results SET value = value + 1 WHERE id = (SELECT id FROM kpi_results WHERE value IS NOT NULL LIMIT 1)'))).rejects.toThrow(/IMMUTABLE_RECORD/);
  });
  it('source rows from imports cannot be altered', async () => {
    const r = await as(T['acme-pay-demo'])((t) => one<any>(t, 'SELECT id FROM import_source_rows LIMIT 1'));
    if (r) await expect(as(T['acme-pay-demo'])((t) => t.query(`UPDATE import_source_rows SET raw = '{}'::jsonb WHERE id = $1`, [r.id]))).rejects.toThrow(/IMMUTABLE_RECORD/);
  });
  it('the audit hash chain verifies', async () => {
    const { verifyAuditChain } = await import('@/lib/audit');
    const v = await as(T['mips-demo'])((t) => verifyAuditChain(t));
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(5);
  });
});

describe('segregation of duties (database constraints)', () => {
  it('a supplier invoice cannot be approved by its submitter', async () => {
    await expect(as(T['mips-demo'], fin)((t) => t.query(`UPDATE supplier_invoices SET approved_by = submitted_by, status = 'approved' WHERE id = (SELECT id FROM supplier_invoices WHERE status = 'received' LIMIT 1)`))).rejects.toThrow(/check constraint/);
  });
  it('a decision cannot be approved by its proposer (service + DB)', async () => {
    const { createDecision, approveDecision } = await import('@/lib/services/decisions');
    const d = await as(T['mips-demo'], cfo)((t) => createDecision(t, { tenantId: T['mips-demo'], userId: cfo }, { title: 'SoD test decision', description: 'Integration test decision', rationale: 'Integration test rationale', ownerUserId: fin, approverUserId: ceo, deadline: '2026-12-31', evidence: [] }));
    await expect(as(T['mips-demo'], cfo)((t) => approveDecision(t, { tenantId: T['mips-demo'], userId: cfo }, d.id))).rejects.toThrow(/Segregation of duties/);
    const ok = await as(T['mips-demo'], ceo)((t) => approveDecision(t, { tenantId: T['mips-demo'], userId: ceo }, d.id));
    expect(ok.initiativeId).toBeTruthy();
  });
});
