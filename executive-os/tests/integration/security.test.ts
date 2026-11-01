import { describe, it, expect, beforeAll } from 'vitest';
import { tenants, userId, as, q, one, withoutTenant } from './helpers';
import { uploadFile } from '@/lib/services/imports';

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
    const chair = await userId('chair@mips.demo');
    await expect(as(T['mips-demo'], chair)((t) => approveDecision(t, { tenantId: T['mips-demo'], userId: chair }, d.id))).rejects.toThrow(/designated approver/);
    const ok = await as(T['mips-demo'], ceo)((t) => approveDecision(t, { tenantId: T['mips-demo'], userId: ceo }, d.id));
    expect(ok.initiativeId).toBeTruthy();
  });
});

describe('user accounts isolation (users RLS)', () => {
  let acmeOnly: string;
  beforeAll(async () => { acmeOnly = await userId('cfo@acme.demo'); });
  it('a tenant sees only accounts that are members of it', async () => {
    const seen = await as(T['mips-demo'], ceo)((t) => q<any>(t, 'SELECT id, email FROM users'));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((u) => u.id === acmeOnly)).toBe(false);
    const members = await as(T['mips-demo'], ceo)((t) => q<any>(t, 'SELECT DISTINCT user_id FROM memberships'));
    expect(new Set(seen.map((u) => u.id))).toEqual(new Set(members.map((m) => m.user_id)));
  });
  it('another tenant’s account cannot be read by id, nor its password hash', async () => {
    const leak = await as(T['mips-demo'], ceo)((t) => one<any>(t, 'SELECT password_hash, mfa_secret FROM users WHERE id = $1', [acmeOnly]));
    expect(leak).toBeNull();
  });
  it('without context no account is visible', async () => {
    const n = await withoutTenant((t) => one<any>(t, 'SELECT count(*)::int AS n FROM users'));
    expect(n!.n).toBe(0);
  });
  it('an account can update only itself', async () => {
    const other = await as(T['mips-demo'], ceo)((t) => t.query("UPDATE users SET name = name WHERE id = $1", [cfo]));
    expect(other.rowCount).toBe(0);
    const self = await as(T['mips-demo'], ceo)((t) => t.query("UPDATE users SET name = name WHERE id = $1", [ceo]));
    expect(self.rowCount).toBe(1);
  });
  it('the runtime role cannot create or delete accounts directly', async () => {
    await expect(as(T['mips-demo'], ceo)((t) => t.query("INSERT INTO users (email, name, password_hash) VALUES ('x@y.z','x','x')"))).rejects.toThrow(/permission denied/);
    await expect(as(T['mips-demo'], ceo)((t) => t.query('DELETE FROM users WHERE id = $1', [ceo]))).rejects.toThrow(/permission denied/);
  });
  it('an admin finds an existing account of another tenant by email, or creates a new one', async () => {
    const admin = await userId('admin@mips.demo');
    const found = await as(T['mips-demo'], admin)((t) => one<any>(t, "SELECT * FROM admin_find_or_create_user('CFO@acme.demo','x','h')"));
    expect(found).toEqual({ user_id: acmeOnly, created: false });
    const email = `it-${Date.now()}@mips.test`;
    const made = await as(T['mips-demo'], admin)((t) => one<any>(t, 'SELECT * FROM admin_find_or_create_user($1,$2,$3)', [email, 'IT user', 'h']));
    expect(made!.created).toBe(true);
  });
  it('account creation requires admin.users in the current tenant', async () => {
    await expect(as(T['mips-demo'], fin)((t) => q(t, "SELECT * FROM admin_find_or_create_user('nobody@x.test','N','h')"))).rejects.toThrow(/admin\.users permission required/);
    await expect(withoutTenant((t) => q(t, "SELECT * FROM admin_find_or_create_user('nobody@x.test','N','h')"))).rejects.toThrow(/admin\.users permission required/);
  });
});

describe('card numbers (PAN) at import', () => {
  it('a file containing a full PAN is refused, nothing is stored, the refusal is audited masked', async () => {
    const file = Buffer.from(['external_ref,merchant_code,product_code,acquirer_code,payment_method,card_region,status,txn_currency,amount,event_at,card_number',
      'PAN-0001,M001,ECOM,SBM,visa,international,success,MUR,100.00,2026-10-30T10:00:00+04:00,4111 1111 1111 1111'].join('\n'));
    const before = await as(T['mips-demo'], fin)((t) => one<any>(t, 'SELECT (SELECT count(*) FROM import_batches)::int AS b, (SELECT count(*) FROM source_files)::int AS f'));
    const up = await as(T['mips-demo'], fin)((t) => uploadFile(t, { tenantId: T['mips-demo'], userId: fin }, { name: 'pan.csv', bytes: file }));
    expect(up.batchId).toBeNull();
    expect(up.panRejected?.count).toBe(1);
    const after = await as(T['mips-demo'], fin)((t) => one<any>(t, 'SELECT (SELECT count(*) FROM import_batches)::int AS b, (SELECT count(*) FROM source_files)::int AS f'));
    expect(after).toEqual(before);
    const ev = await as(T['mips-demo'], fin)((t) => one<any>(t, "SELECT payload FROM audit_events WHERE action = 'import.rejected_pan' ORDER BY id DESC LIMIT 1"));
    expect(ev!.payload.locations[0]).toEqual({ row: 2, column: 'card_number', masked: '411111******1111' });
    expect(JSON.stringify(ev!.payload)).not.toMatch(/4111 ?1111 ?1111 ?1111/);
  });
});
