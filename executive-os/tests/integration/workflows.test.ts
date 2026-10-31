import { describe, it, expect, beforeAll } from 'vitest';
import { tenants, userId, as, q, one } from './helpers';
import { uploadFile, validateBatch, approveBatch, commitBatch } from '@/lib/services/imports';
import { ensureRun, resultsForRun } from '@/lib/services/kpi';
import { kpiProof, reproduce, verifyMerchantFees } from '@/lib/services/proof';
import { economicsBy } from '@/lib/services/merchants';
import { createScenario, createDecision, approveDecision, measureOutcome } from '@/lib/services/decisions';
import { generateReport } from '@/lib/services/reports';
import { dec, sum } from '@/lib/money';
import { contextFromToken } from '@/lib/auth/session';

let T: Record<string, string>; let fin: string; let cfo: string; let ceo: string;
beforeAll(async () => { T = await tenants(); fin = await userId('finance@mips.demo'); cfo = await userId('cfo@mips.demo'); ceo = await userId('ceo@mips.demo'); });
const M = () => T['mips-demo'];

describe('import framework', () => {
  const csv = (rows: string[]) => Buffer.from(['external_ref,merchant_code,product_code,acquirer_code,payment_method,card_region,status,txn_currency,amount,event_at', ...rows].join('\n'));
  it('validates, detects duplicates, enforces SoD, commits transactionally and reconciles', async () => {
    const file = csv([
      'IT-0001,M001,ECOM,SBM,visa,international,success,MUR,20000.00,2026-10-30T10:00:00+04:00',
      'IT-0002,M001,ECOM,SBM,visa,international,success,EUR,500.00,2026-10-30T11:00:00+04:00',
      'IT-0001,M001,ECOM,SBM,visa,international,success,MUR,20000.00,2026-10-30T10:00:00+04:00',
      'IT-0003,NOPE,ECOM,SBM,visa,domestic,success,MUR,10.00,2026-10-30T12:00:00+04:00',
      'IT-0004,M001,ECOM,SBM,visa,domestic,success,MUR,99.00,2026-01-10T12:00:00+04:00',
    ]);
    const up = await as(M(), fin)((t) => uploadFile(t, { tenantId: M(), userId: fin }, { name: 'it.csv', bytes: file }));
    expect(up.duplicateFile).toBe(false);
    const v = await as(M(), fin)((t) => validateBatch(t, { tenantId: M(), userId: fin }, up.batchId));
    expect(v).toMatchObject({ rows: 5, valid: 2, duplicates: 1, errors: 2 });  // unknown merchant + locked Jan 2026
    await expect(as(M(), fin)((t) => approveBatch(t, { tenantId: M(), userId: fin }, up.batchId))).rejects.toThrow(/Segregation/);
    await as(M(), cfo)((t) => approveBatch(t, { tenantId: M(), userId: cfo }, up.batchId));
    const c = await as(M(), cfo)((t) => commitBatch(t, { tenantId: M(), userId: cfo }, up.batchId, { recalc: false }));
    expect(c).toMatchObject({ committed_rows: 2, rows_reconcile: true, duplicates_skipped: 1, errors_not_imported: 2 });
    // traceability: committed transaction → source row → original file
    const tr = await as(M())((t) => one<any>(t, `SELECT t.amount_base::text, t.fx_rate_to_base::text, t.mdr_fee_base::text, s.raw->>'external_ref' AS raw_ref, f.sha256 FROM transactions t JOIN import_source_rows s ON s.id = t.source_row_id JOIN source_files f ON f.batch_id = t.import_batch_id WHERE t.external_ref = 'IT-0002'`));
    expect(tr.raw_ref).toBe('IT-0002');
    expect(dec(tr.amount_base).eq(dec('500').times(tr.fx_rate_to_base).toDecimalPlaces(4))).toBe(true);
    expect(dec(tr.mdr_fee_base).gt(0)).toBe(true);
    // idempotent re-upload
    const again = await as(M(), fin)((t) => uploadFile(t, { tenantId: M(), userId: fin }, { name: 'it-copy.csv', bytes: file }));
    expect(again).toEqual({ batchId: up.batchId, duplicateFile: true });
  });
});

describe('calculation engine & proof', () => {
  it('KPI runs are reproducible and every result is traceable to a formula version', async () => {
    const r = await as(M(), cfo)(async (t) => { const { runId } = await ensureRun(t, { tenantId: M(), userId: cfo, start: '2026-10-01', end: '2026-10-31', reason: 'test' }); return resultsForRun(t, runId); });
    expect(r.length).toBeGreaterThan(30);
    expect(r.every((x) => x.formula_version >= 1)).toBe(true);
    const rev = r.find((x) => x.code === 'PAY.CONTRIBUTION')!;
    const rep = await as(M(), cfo)((t) => reproduce(t, 'PAY.CONTRIBUTION', '2026-10-01', '2026-10-31', { value: rev.value, inputs: rev.inputs }));
    expect(rep.identical).toBe(true);
  });
  it('August 2026 GL revenue is DISPUTED by the reconciliation control (storyline)', async () => {
    const p = await as(M(), cfo)((t) => kpiProof(t, { tenantId: M(), userId: cfo }, 'FIN.REVENUE', '2026-08-01', '2026-08-31'));
    expect(p!.result.confidence).toBe('DISPUTED');
    expect(p!.checks.find((c: any) => c.code === 'C07').status).toBe('fail');
  });
  it('merchant totals sum exactly to the portfolio and overhead allocation sums to the pool', async () => {
    const e = await as(M())((t) => economicsBy(t, '2026-10-01', '2026-10-31', 'merchant'));
    expect(sum(e.rows.map((r) => r.contribution)).eq(dec(e.totals.contribution))).toBe(true);
    expect(sum(e.rows.map((r) => r.overhead)).eq(dec(e.overheadPool))).toBe(true);
  });
  it('fees recompute from contracts with zero mismatches; SBM 195 bps schedule applies from Sep 2026', async () => {
    const lag = await as(M())((t) => one<any>(t, "SELECT id FROM merchants WHERE code = 'M001'"));
    const v = await as(M())((t) => verifyMerchantFees(t, lag!.id, '2026-09-01', '2026-09-30'));
    expect(v.mismatchCount).toBe(0);
    expect(v.schedulesUsed.some((s: any) => s.schedule_ref.startsWith('SBM-FS-2026-09') && s.wholesale_bps === '195.0000')).toBe(true);
  });
});

describe('decision lifecycle → report', () => {
  it('scenario → decision → approval → initiative → outcome → board report', async () => {
    const lag = await as(M())((t) => one<any>(t, "SELECT id FROM merchants WHERE code = 'M001'"));
    const s = await as(M(), cfo)((t) => createScenario(t, { tenantId: M(), userId: cfo }, { name: 'IT +25 bps', template: 'merchant_repricing', assumptions: { merchantId: lag!.id, mdrChangeBps: '25', churnProbability: '0.1' } }));
    const d = await as(M(), cfo)((t) => createDecision(t, { tenantId: M(), userId: cfo }, { title: 'IT reprice Lagoon', description: 'Integration test repricing', rationale: 'Wholesale increase pass-through', scenarioId: s.id, ownerUserId: cfo, approverUserId: ceo, deadline: '2026-11-30', evidence: [] }));
    await as(M(), ceo)((t) => approveDecision(t, { tenantId: M(), userId: ceo }, d.id));
    const ini = await as(M())((t) => q<any>(t, 'SELECT code FROM initiatives WHERE decision_id = $1', [d.id]));
    expect(ini).toHaveLength(1);
    const o: any = await as(M(), ceo)((t) => measureOutcome(t, { tenantId: M(), userId: ceo }, d.id));
    expect(['awaiting_data', 'measured']).toContain(o.status);
    const rid = await as(M(), ceo)((t) => generateReport(t, { tenantId: M(), userId: ceo }, 'decision_outcome', '2026-10-01', '2026-10-31', { decisionId: d.id }));
    const r = await as(M())((t) => one<any>(t, 'SELECT content, content_sha256 FROM reports WHERE id = $1', [rid]));
    expect(r.content.sections.filter((x: any) => x.type === 'heading').map((x: any) => x.text)).toEqual(['1. Original issue', '2. Supporting evidence', '3. Approved decision', '4. Measured outcome']);
    expect(r.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('authentication', () => {
  it('invalid / missing session tokens resolve to no context', async () => {
    expect(await contextFromToken(undefined)).toBeNull();
    expect(await contextFromToken('not-a-real-token')).toBeNull();
  });
});
