/**
 * Performance test: loads N synthetic transactions (default 1,000,000) into the
 * TEST database's mips-demo tenant and times the heavy server-side paths.
 *   TEST_DATABASE_OWNER_URL=... PERF_ROWS=1000000 npm run test:perf
 * Run `npm run test:integration` first (it migrates and seeds the test DB).
 */
import { Client } from 'pg';
import { economicsBy, marginAlerts } from '../../src/lib/services/merchants';
import { loadPeriodFacts } from '../../src/lib/services/facts';
import { runChecks } from '../../src/lib/services/checks';
import { runCalculation } from '../../src/lib/services/kpi';

const url = process.env.TEST_DATABASE_OWNER_URL ?? 'postgres://mips_owner:owner_dev_pw@localhost:5432/mips_eos_test';
const N = Number(process.env.PERF_ROWS ?? 1_000_000);
const BUDGET_MS: Record<string, number> = { 'facts (12 months)': 8000, 'merchant economics (1 month)': 3000, 'merchant economics (12 months)': 8000, 'acquirer economics (12 months)': 8000, 'controls (12 months)': 15000, 'margin alerts': 5000, 'calculation run (1 month)': 6000 };

(async () => {
  const c = new Client({ connectionString: url }); await c.connect();
  const t = (await c.query("SELECT id FROM tenants WHERE code = 'mips-demo'")).rows[0].id;
  await c.query("SELECT set_config('app.tenant_id', $1, false)", [t]);
  const have = Number((await c.query("SELECT count(*) FROM transactions WHERE external_ref LIKE 'PERF-%'")).rows[0].count);
  if (have < N) {
    const t0 = Date.now();
    await c.query(`WITH m AS (SELECT array_agg(id) a FROM merchants), p AS (SELECT array_agg(id) a FROM products WHERE is_transactional), pm AS (SELECT array_agg(id) a FROM payment_methods), aq AS (SELECT array_agg(id) a FROM acquirers)
      INSERT INTO transactions (tenant_id, external_ref, merchant_id, product_id, acquirer_id, payment_method_id, card_region, status, txn_currency, settlement_currency, amount, fx_rate_to_base, amount_base, mdr_fee_base, wholesale_fee_base, processing_cost_base, event_at, accounting_date, is_demo)
      SELECT $1, 'PERF-' || g, m.a[1 + (g % array_length(m.a,1))], p.a[1 + (g % array_length(p.a,1))], aq.a[1 + (g % array_length(aq.a,1))], pm.a[1 + (g % array_length(pm.a,1))],
        CASE WHEN g % 5 = 0 THEN 'international' ELSE 'domestic' END, CASE WHEN g % 23 = 0 THEN 'failed' ELSE 'success' END, 'MUR', 'MUR',
        amt, 1, amt, CASE WHEN g % 23 = 0 THEN 0 ELSE round(amt * 0.02, 4) END, CASE WHEN g % 23 = 0 THEN 0 ELSE round(amt * 0.0135, 4) END, 2.1,
        d::timestamptz + interval '10 hours', d, true
      FROM generate_series($2::bigint + 1, $3::bigint) g CROSS JOIN m CROSS JOIN p CROSS JOIN pm CROSS JOIN aq
      CROSS JOIN LATERAL (SELECT (500 + (g * 7919) % 20000)::numeric AS amt, ('2025-11-01'::date + (g % 365)::int) AS d) x`, [t, have, N]);
    await c.query('ANALYZE transactions');
    console.log(`inserted ${N - have} rows in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const total = (await c.query('SELECT count(*) FROM transactions')).rows[0].count;
  console.log(`transactions in tenant: ${total}`);
  await c.query('BEGIN');
  const results: [string, number][] = [];
  const time = async (label: string, fn: () => Promise<unknown>) => { const s = Date.now(); await fn(); results.push([label, Date.now() - s]); };
  await time('facts (12 months)', () => loadPeriodFacts(c as any, '2025-11-01', '2026-10-31'));
  await time('merchant economics (1 month)', () => economicsBy(c as any, '2026-10-01', '2026-10-31', 'merchant'));
  await time('merchant economics (12 months)', () => economicsBy(c as any, '2025-11-01', '2026-10-31', 'merchant'));
  await time('acquirer economics (12 months)', () => economicsBy(c as any, '2025-11-01', '2026-10-31', 'acquirer'));
  await time('controls (12 months)', () => runChecks(c as any, '2025-11-01', '2026-10-31'));
  await time('margin alerts', () => marginAlerts(c as any, '2026-10-01'));
  await time('calculation run (1 month)', () => runCalculation(c as any, { tenantId: t, userId: null, start: '2026-10-01', end: '2026-10-31', reason: 'perf test' }));
  await c.query('ROLLBACK'); await c.end();
  let fail = false;
  for (const [l, ms] of results) { const ok = ms <= BUDGET_MS[l]; if (!ok) fail = true; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l.padEnd(34)} ${String(ms).padStart(6)} ms  (budget ${BUDGET_MS[l]} ms)`); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
