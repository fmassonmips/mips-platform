/**
 * Financial Proof Center services: KPI provenance, supporting records,
 * reproducibility checks, fee re-computation from contracts, verification and
 * evidence packages (hash-manifested).
 */
import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { q, one } from '../db';
import { audit } from '../audit';
import { dec, sum, ZERO } from '../money';
import { KPI_BY_CODE, computeKpis, formulaHash, type Source } from '../engine/kpis';
import { computeTxnEconomics, type PricingRule, type FeeRule, type ProcessingRule } from '../engine/fees';
import { loadPeriodFacts } from './facts';
import { ensureRun } from './kpi';
import { addDays, daysBetween, monthsInRange } from '../dates';

export async function kpiProof(tx: Tx, ctx: { tenantId: string; userId: string }, code: string, start: string, end: string) {
  const def = KPI_BY_CODE[code];
  if (!def) return null;
  const { runId } = await ensureRun(tx, { ...ctx, start, end, reason: `proof center: ${code}` });
  const result = await one<any>(tx, `SELECT r.*, r.value::text AS value, f.version, f.formula, f.numerator, f.denominator, f.data_source, f.grain, f.period_basis, f.currency_rule, f.rounding, f.validation_rules, f.engine_ref, f.formula_hash, f.effective_from, k.owner, k.definition, k.unit, k.materiality_pct
    FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id JOIN formula_versions f ON f.id = r.formula_version_id WHERE r.calc_run_id = $1 AND k.code = $2 AND r.dimension = 'total'`, [runId, code]);
  const dims = await q<any>(tx, `SELECT r.dimension, r.value::text, r.confidence FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id WHERE r.calc_run_id = $1 AND k.code = $2 AND r.dimension <> 'total' ORDER BY r.value DESC`, [runId, code]);
  const run = await one<any>(tx, 'SELECT id, engine_version, started_at, finished_at, checks, input_fingerprint, trigger_reason FROM calc_runs WHERE id = $1', [runId]);
  const versions = await q<any>(tx, `SELECT f.version, f.formula, f.formula_hash, f.effective_from, f.created_at, u.name AS approved_by FROM formula_versions f JOIN kpi_definitions k ON k.id = f.kpi_id LEFT JOIN users u ON u.id = f.approved_by WHERE k.code = $1 ORDER BY f.version DESC`, [code]);
  const checks = (run.checks as any[]).filter((c) => c.affects.some((s: Source) => def.sources.includes(s)));
  const batches = await sourceBatches(tx, def.sources, start, end);
  const verifications = await q<any>(tx, `SELECT v.status, v.basis, v.evidence_refs, v.created_at, u.name AS verified_by, (v.kpi_result_id = $3) AS same_result
    FROM kpi_verifications v JOIN kpi_definitions k ON k.id = v.kpi_id LEFT JOIN users u ON u.id = v.verified_by WHERE k.code = $1 AND v.period_start = $2 ORDER BY v.created_at DESC`, [code, start, result?.id ?? null]);
  const history = await q<any>(tx, `SELECT r.calc_run_id, r.value::text, r.confidence, r.computed_at, r.is_current, c.trigger_reason FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id JOIN calc_runs c ON c.id = r.calc_run_id
    WHERE k.code = $1 AND r.period_start = $2 AND r.period_end = $3 AND r.dimension = 'total' ORDER BY r.computed_at DESC LIMIT 20`, [code, start, end]);
  const periods = await q<any>(tx, `SELECT period::text, status, locked_at FROM financial_periods WHERE period = ANY($1::date[]) ORDER BY 1`, [monthsInRange(start, end)]);
  const adjustments = await q<any>(tx, `SELECT reference, kind, description, amount_base::text, status, approved_at FROM adjustments WHERE period BETWEEN date_trunc('month',$1::date) AND $2 ORDER BY period`, [start, end]);
  const glAdjustments = await one<any>(tx, `SELECT count(*)::int AS n, coalesce(sum(debit_base - credit_base),0)::text AS net FROM gl_entries WHERE is_adjustment AND entry_date BETWEEN $1 AND $2`, [start, end]);
  return { def, result, dims, run, versions, checks, batches, verifications, history, periods, adjustments, glAdjustments, registryHashMatches: result?.formula_hash === formulaHash(def) };
}

async function sourceBatches(tx: Tx, sources: Source[], start: string, end: string) {
  const out: any[] = [];
  const add = async (kind: string, table: string, dateCol: string) => {
    const rows = await q<any>(tx, `SELECT coalesce(b.id::text, 'generator') AS batch_id, b.filename, b.file_sha256, b.status, b.source_system, b.committed_at, ua.name AS approved_by, count(x.*)::int AS records,
        bool_or(x.is_demo) AS demo
      FROM ${table} x LEFT JOIN import_batches b ON b.id = x.import_batch_id LEFT JOIN users ua ON ua.id = b.approved_by
      WHERE x.${dateCol} BETWEEN $1 AND $2 GROUP BY 1,2,3,4,5,6,7`, [start, end]);
    for (const r of rows) out.push({ kind, ...r });
  };
  if (sources.includes('transactions')) await add('transactions', 'transactions', 'accounting_date');
  if (sources.includes('gl')) await add('gl_entries', 'gl_entries', 'entry_date');
  if (sources.includes('bank')) await add('bank_transactions', 'bank_transactions', 'txn_date');
  return out;
}

/** Supporting records for a KPI (bounded sample + totals that must equal the KPI inputs). */
export async function supportingRecords(tx: Tx, code: string, start: string, end: string, limit = 50) {
  const def = KPI_BY_CODE[code];
  if (def.sources.includes('gl')) {
    const lines = await q<any>(tx, `SELECT a.code, a.name, a.pl_line, count(*)::int AS entries, sum(e.debit_base)::text AS debit, sum(e.credit_base)::text AS credit, bool_or(e.is_adjustment) AS has_adjustments
      FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2 AND a.pl_line IS NOT NULL GROUP BY 1,2,3 ORDER BY 1`, [start, end]);
    const entries = await q<any>(tx, `SELECT e.journal_ref, e.line_no, e.entry_date, a.code AS account, e.description, e.debit_base::text AS debit, e.credit_base::text AS credit, e.source_system, e.import_batch_id
      FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2 AND a.pl_line = 'revenue' ORDER BY e.entry_date, e.journal_ref, e.line_no LIMIT $3`, [start, end, limit]);
    return { kind: 'gl', lines, entries };
  }
  if (def.sources.includes('transactions')) {
    const byMerchant = await q<any>(tx, `SELECT m.id, m.name, count(*)::int AS txns, coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv, sum(t.mdr_fee_base)::text AS mdr, sum(t.wholesale_fee_base)::text AS wholesale, sum(t.processing_cost_base)::text AS processing
      FROM transactions t JOIN merchants m ON m.id = t.merchant_id WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY sum(t.mdr_fee_base) DESC`, [start, end]);
    const sample = await q<any>(tx, `SELECT t.external_ref, t.accounting_date, m.name AS merchant, t.status, t.amount_base::text, t.mdr_fee_base::text, t.wholesale_fee_base::text, pa.contract_ref, fs.schedule_ref
      FROM transactions t JOIN merchants m ON m.id = t.merchant_id LEFT JOIN pricing_agreements pa ON pa.id = t.pricing_agreement_id LEFT JOIN fee_schedules fs ON fs.id = t.fee_schedule_id
      WHERE t.accounting_date BETWEEN $1 AND $2 ORDER BY t.amount_base DESC LIMIT $3`, [start, end, limit]);
    return { kind: 'transactions', byMerchant, sample };
  }
  if (def.sources.includes('bank')) {
    const accounts = await q<any>(tx, `SELECT ba.code, ba.name, ba.account_class, ba.currency, ba.opening_balance::text, coalesce(sum(bt.amount) FILTER (WHERE bt.txn_date <= $2),0)::text AS movements, count(bt.*) FILTER (WHERE bt.txn_date BETWEEN $1 AND $2)::int AS lines
      FROM bank_accounts ba LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id GROUP BY ba.id ORDER BY ba.account_class, ba.code`, [start, end]);
    return { kind: 'bank', accounts };
  }
  if (def.sources.includes('ar')) {
    const invoices = await q<any>(tx, `SELECT ci.number, m.name AS merchant, ci.issue_date, ci.due_date, ci.amount::text, ci.amount_paid::text, ci.paid_date, ci.status, ci.disputed FROM customer_invoices ci JOIN merchants m ON m.id = ci.merchant_id
      WHERE ci.issue_date <= $2 AND (ci.paid_date IS NULL OR ci.paid_date > $2 OR ci.issue_date >= $1) ORDER BY ci.issue_date DESC LIMIT $3`, [start, end, limit]);
    return { kind: 'ar', invoices };
  }
  return { kind: 'ops' };
}

const canon = (o: any) => JSON.stringify(Object.keys(o ?? {}).sort().map((k) => [k, o[k]]));

/** Re-compute the KPI from freshly loaded facts and compare with the stored result. */
export async function reproduce(tx: Tx, code: string, start: string, end: string, stored: { value: string | null; inputs: any }) {
  const days = daysBetween(start, end);
  const priorEnd = addDays(start, -1);
  const facts = await loadPeriodFacts(tx, start, end);
  const prior = await loadPeriodFacts(tx, addDays(priorEnd, -days), priorEnd);
  const v = computeKpis(facts, prior).find((x) => x.code === code && x.dimension === 'total');
  const same = (v?.value ?? null) === (stored.value === null ? null : dec(stored.value).toDecimalPlaces(8).toString()) && canon(v?.inputs) === canon(stored.inputs);
  return { recomputed: v?.value ?? null, inputs: v?.inputs, identical: same };
}

/**
 * Independently re-derive every transaction's fees from the effective pricing
 * agreements and fee schedules, and compare with the stored fees.
 */
export async function verifyMerchantFees(tx: Tx, merchantId: string, start: string, end: string) {
  const pricing = await q<PricingRule>(tx, 'SELECT id, merchant_id, payment_method_id, card_region, mdr_bps::text, fixed_fee::text, effective_from, effective_to FROM pricing_agreements WHERE merchant_id = $1', [merchantId]);
  const fees = await q<FeeRule>(tx, 'SELECT id, acquirer_id, payment_method_id, card_region, wholesale_bps::text, fixed_fee::text, effective_from, effective_to FROM fee_schedules');
  const proc = await q<ProcessingRule>(tx, 'SELECT product_id, cost_per_txn::text, cost_bps::text, effective_from, effective_to FROM processing_cost_rates');
  const txns = await q<any>(tx, `SELECT id, external_ref, merchant_id, acquirer_id, payment_method_id, product_id, card_region, status, amount_base::text, accounting_date, mdr_fee_base::text, wholesale_fee_base::text, processing_cost_base::text, pricing_agreement_id, fee_schedule_id
    FROM transactions WHERE merchant_id = $1 AND accounting_date BETWEEN $2 AND $3`, [merchantId, start, end]);
  const mismatches: any[] = []; let mdr = ZERO, wh = ZERO, pr = ZERO, smdr = ZERO, swh = ZERO, spr = ZERO;
  const bySchedule = new Map<string, { txns: number; wholesale: string }>();
  for (const t of txns) {
    const e = computeTxnEconomics(t, pricing, fees, proc);
    const em = e.mdr.toDecimalPlaces(4), ew = e.wholesale.toDecimalPlaces(4), ep = e.processing.toDecimalPlaces(4);
    mdr = mdr.plus(em); wh = wh.plus(ew); pr = pr.plus(ep); smdr = smdr.plus(t.mdr_fee_base); swh = swh.plus(t.wholesale_fee_base); spr = spr.plus(t.processing_cost_base);
    const k = e.feeScheduleId ?? 'none'; const b = bySchedule.get(k) ?? { txns: 0, wholesale: '0' }; b.txns++; b.wholesale = dec(b.wholesale).plus(ew).toString(); bySchedule.set(k, b);
    if (!em.eq(dec(t.mdr_fee_base)) || !ew.eq(dec(t.wholesale_fee_base)) || !ep.eq(dec(t.processing_cost_base)) || e.pricingId !== t.pricing_agreement_id || e.feeScheduleId !== t.fee_schedule_id) {
      if (mismatches.length < 50) mismatches.push({ ref: t.external_ref, stored: { mdr: t.mdr_fee_base, wholesale: t.wholesale_fee_base, processing: t.processing_cost_base, pricing: t.pricing_agreement_id, fee: t.fee_schedule_id }, recomputed: { mdr: em.toString(), wholesale: ew.toString(), processing: ep.toString(), pricing: e.pricingId, fee: e.feeScheduleId } });
    }
  }
  const schedules = await q<any>(tx, `SELECT fs.id, fs.schedule_ref, a.code AS acquirer, fs.card_region, fs.wholesale_bps::text, fs.effective_from, fs.effective_to FROM fee_schedules fs JOIN acquirers a ON a.id = fs.acquirer_id WHERE fs.id = ANY($1::uuid[])`, [[...bySchedule.keys()].filter((k) => k !== 'none')]);
  return {
    transactions: txns.length, mismatches, mismatchCount: mismatches.length,
    stored: { mdr: smdr.toString(), wholesale: swh.toString(), processing: spr.toString(), contribution: smdr.minus(swh).minus(spr).toString() },
    recomputed: { mdr: mdr.toString(), wholesale: wh.toString(), processing: pr.toString(), contribution: mdr.minus(wh).minus(pr).toString() },
    agreements: pricing, schedulesUsed: schedules.map((s) => ({ ...s, ...bySchedule.get(s.id) })),
  };
}

export async function recordVerification(tx: Tx, ctx: { tenantId: string; userId: string }, code: string, start: string, end: string, status: string, basis: string, evidenceRefs: string[]) {
  const proof = await kpiProof(tx, ctx, code, start, end);
  if (!proof?.result) throw new Error('No KPI result to verify');
  if (status === 'VERIFIED' && proof.checks.some((c: any) => c.status === 'fail')) throw new Error('Cannot record VERIFIED while a control affecting this KPI is failing — resolve the discrepancy first or record DISPUTED');
  await tx.query(`INSERT INTO kpi_verifications (tenant_id, kpi_id, period_start, kpi_result_id, status, basis, evidence_refs, verified_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ctx.tenantId, proof.result.kpi_id, start, proof.result.id, status, basis, JSON.stringify(evidenceRefs), ctx.userId]);
  await tx.query(`INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, created_by) VALUES ($1,'kpi_result',$2,'approval',$3,$4,$5)`, [ctx.tenantId, proof.result.id, `verification:${code}:${start}`, `${status}: ${basis}`, ctx.userId]);
  await audit(tx, { tenantId: ctx.tenantId, userId: ctx.userId, action: 'kpi.verification_recorded', entityType: 'kpi_results', entityId: proof.result.id, payload: { code, start, end, status, basis, evidenceRefs } });
}

/** Evidence package: everything needed to re-perform the KPI, with a SHA-256 manifest. */
export async function evidencePackage(tx: Tx, ctx: { tenantId: string; userId: string }, code: string, start: string, end: string) {
  const p = await kpiProof(tx, ctx, code, start, end);
  if (!p) throw new Error('Unknown KPI');
  const records = await supportingRecords(tx, code, start, end, 500);
  const reproduction = p.result ? await reproduce(tx, code, start, end, { value: p.result.value, inputs: p.result.inputs }) : null;
  const sections = {
    kpi: { code, name: p.def.name, definition: p.def.definition, unit: p.def.unit, owner: p.def.owner, sources: p.def.sources },
    formula: { version: p.result?.version, formula: p.def.formula, numerator: p.def.numerator, denominator: p.def.denominator, data_source: p.def.dataSource, grain: p.def.grain, period_basis: p.def.periodBasis, currency_rule: p.def.currencyRule, rounding: p.def.rounding, formula_hash: p.result?.formula_hash, registry_hash_matches: p.registryHashMatches, versions: p.versions },
    result: p.result ? { id: p.result.id, value: p.result.value, currency: p.result.currency, inputs: p.result.inputs, input_hash: p.result.input_hash, confidence: p.result.confidence, status_note: p.result.status_note, computed_at: p.result.computed_at, period: { start, end } } : null,
    calculation_run: { id: p.run.id, engine: p.run.engine_version, input_fingerprint: p.run.input_fingerprint, started_at: p.run.started_at, finished_at: p.run.finished_at },
    reproduction, controls: p.checks, source_batches: p.batches, supporting_records: records, periods: p.periods, adjustments: p.adjustments, verifications: p.verifications, result_history: p.history,
    disclaimer: 'Management evidence package. VERIFIED denotes internal reconciliation against approved evidence and is not an external audit opinion.',
  };
  const manifest = Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, createHash('sha256').update(JSON.stringify(v)).digest('hex')]));
  const body = { generated_at: new Date().toISOString(), tenant_id: ctx.tenantId, generated_by: ctx.userId, ...sections, manifest };
  const packageHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  await tx.query(`INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, sha256, created_by) VALUES ($1,'kpi_result',$2,'report',$3,$4,$5,$6)`,
    [ctx.tenantId, p.result?.id ?? code, `evidence-package:${code}:${start}..${end}`, 'Evidence package exported', packageHash, ctx.userId]);
  await audit(tx, { tenantId: ctx.tenantId, userId: ctx.userId, action: 'proof.evidence_package_exported', entityType: 'kpi_results', entityId: p.result?.id ?? null, payload: { code, start, end, sha256: packageHash } });
  return { body, packageHash };
}

export async function proofCatalogue(tx: Tx, runId: string) {
  return q<any>(tx, `SELECT d.code, d.name, d.category, d.unit, r.value::text, r.confidence, r.status_note, r.id, f.version, d.owner
    FROM kpi_results r JOIN kpi_definitions d ON d.id = r.kpi_id JOIN formula_versions f ON f.id = r.formula_version_id WHERE r.calc_run_id = $1 AND r.dimension = 'total' ORDER BY d.category, d.code`, [runId]);
}
export { sum };
