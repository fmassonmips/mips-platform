/**
 * Formula audit — automated data & calculation controls.
 * Each check states which KPI sources it affects; a failing check marks
 * dependent KPI results as DISPUTED (never silently hidden).
 */
import type { Tx } from '../db';
import { q, one } from '../db';
import { dec } from '../money';
import { KPIS, formulaHash, type Source } from '../engine/kpis';
import { policyOf, tenantInfo, SAAS_CTE } from './facts';
import { monthsInRange, monthEnd } from '../dates';

export interface CheckResult { code: string; name: string; category: string; status: 'pass' | 'warn' | 'fail'; detail: string; affects: Source[]; count: number; samples: string[] }

export async function runChecks(tx: Tx, start: string, end: string): Promise<CheckResult[]> {
  const t = await tenantInfo(tx);
  const out: CheckResult[] = [];
  const push = (c: CheckResult) => out.push(c);

  // C01 Missing values: successful transactions without pricing / fee schedule
  const miss = await one<any>(tx, `SELECT
      count(*) FILTER (WHERE status='success' AND pricing_agreement_id IS NULL)::int AS no_pricing,
      count(*) FILTER (WHERE status='success' AND acquirer_id IS NOT NULL AND fee_schedule_id IS NULL)::int AS no_fee,
      (array_agg(external_ref) FILTER (WHERE status='success' AND (pricing_agreement_id IS NULL OR (acquirer_id IS NOT NULL AND fee_schedule_id IS NULL))))[1:5] AS samples
    FROM transactions WHERE accounting_date BETWEEN $1 AND $2`, [start, end]);
  const nMiss = miss.no_pricing + miss.no_fee;
  push({ code: 'C01', name: 'Missing pricing / fee schedule', category: 'Missing values', status: nMiss ? 'fail' : 'pass', affects: ['transactions', 'pricing'], count: nMiss, samples: miss.samples ?? [],
    detail: nMiss ? `${miss.no_pricing} successful transactions without a pricing agreement, ${miss.no_fee} without a fee schedule` : 'Every successful transaction is priced by an effective agreement and fee schedule' });

  // C02 Probable duplicates (same merchant, amount, within 60 seconds, different refs)
  const dup = await one<any>(tx, `SELECT count(*)::int AS n, (array_agg(external_ref))[1:5] AS samples FROM (
      SELECT external_ref, event_at, lag(event_at) OVER (PARTITION BY merchant_id, amount ORDER BY event_at) AS prev
      FROM transactions WHERE accounting_date BETWEEN $1 AND $2 AND status = 'success') x
    WHERE event_at - prev <= interval '60 seconds'`, [start, end]);
  push({ code: 'C02', name: 'Probable duplicate transactions', category: 'Duplicate records', status: dup.n ? 'warn' : 'pass', affects: ['transactions'], count: dup.n, samples: dup.samples ?? [],
    detail: dup.n ? `${dup.n} pairs with identical merchant & amount within 60 s — review (exact duplicates are blocked by unique external reference)` : 'No probable duplicates; exact duplicates are blocked at import' });

  // C03 Aggregation: Σ merchant contribution = total contribution
  const agg = await one<any>(tx, `WITH ${SAAS_CTE},
      m AS (SELECT merchant_id, sum(mdr_fee_base - wholesale_fee_base - processing_cost_base) AS cm FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1)
    SELECT (SELECT coalesce(sum(cm),0) FROM m)::text AS by_merchant,
           (SELECT coalesce(sum(mdr_fee_base - wholesale_fee_base - processing_cost_base),0) FROM transactions WHERE accounting_date BETWEEN $1 AND $2)::text AS total`, [start, end]);
  const aggDiff = dec(agg.by_merchant).minus(agg.total);
  push({ code: 'C03', name: 'Aggregation integrity (merchant → total)', category: 'Incorrect aggregation', status: aggDiff.isZero() ? 'pass' : 'fail', affects: ['transactions'], count: aggDiff.isZero() ? 0 : 1, samples: [],
    detail: `Σ merchant contribution ${agg.by_merchant} vs total ${agg.total} (difference ${aggDiff.toString()})` });

  // C04 Currency: foreign-currency transactions must carry an FX reference rate
  const ccy = await one<any>(tx, `SELECT count(*)::int AS n, (array_agg(external_ref))[1:5] AS samples FROM transactions
    WHERE accounting_date BETWEEN $1 AND $2 AND txn_currency <> $3 AND (fx_rate_to_base = 1 OR amount_base <> round(amount * fx_rate_to_base, 4))`, [start, end, t.base_currency]);
  push({ code: 'C04', name: 'Currency conversion integrity', category: 'Currency errors', status: ccy.n ? 'fail' : 'pass', affects: ['transactions'], count: ccy.n, samples: ccy.samples ?? [],
    detail: ccy.n ? `${ccy.n} foreign-currency transactions with missing FX rate or base amount ≠ amount × rate` : 'All foreign-currency amounts equal amount × recorded FX rate' });

  // C05 Invalid denominators — evaluated by the engine (null results); reported here for visibility
  const zeroTxn = await one<any>(tx, `SELECT count(*)::int AS n FROM transactions WHERE accounting_date BETWEEN $1 AND $2`, [start, end]);
  push({ code: 'C05', name: 'Valid denominators', category: 'Invalid denominators', status: zeroTxn.n ? 'pass' : 'warn', affects: ['transactions'], count: zeroTxn.n ? 0 : 1, samples: [],
    detail: zeroTxn.n ? 'Ratio KPIs return NULL (never ∞/NaN) when a denominator is zero; transaction denominators are non-zero' : 'No transactions in range: ratio KPIs are not computable' });

  // C06 Formula consistency: DB formula hashes equal engine registry hashes
  const fv = await q<any>(tx, `SELECT d.code, f.formula_hash FROM kpi_definitions d JOIN LATERAL (SELECT formula_hash FROM formula_versions WHERE kpi_id = d.id ORDER BY version DESC LIMIT 1) f ON true`);
  const map = new Map(fv.map((r) => [r.code, r.formula_hash]));
  const bad = KPIS.filter((k) => map.get(k.code) !== formulaHash(k)).map((k) => k.code);
  push({ code: 'C06', name: 'Formula version consistency', category: 'Inconsistent formulas', status: bad.length ? 'fail' : 'pass', affects: ['gl', 'transactions', 'bank', 'ar', 'budget', 'ops'], count: bad.length, samples: bad.slice(0, 5),
    detail: bad.length ? `${bad.length} KPI formulas differ from the registered version — re-sync and approve` : 'All KPI formulas match their registered, hashed versions' });

  // C07 Reconciliation: GL revenue vs transaction-engine revenue, per month
  const policy = policyOf(t);
  const tol = dec(t.settings?.revenue_recon_tolerance ?? '1');
  const curMonth = new Date().toISOString().slice(0, 7) + '-01';
  const months = monthsInRange(start, end).filter((m) => m <= curMonth);
  const recon = await q<any>(tx, `WITH ${SAAS_CTE},
      tx AS (SELECT date_trunc('month', accounting_date)::date AS month, sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wh FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1),
      s AS (SELECT month, sum(fee) AS saas FROM saas GROUP BY 1),
      g AS (SELECT e.period AS month, sum(e.credit_base - e.debit_base) AS rev FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE a.pl_line = 'revenue' AND e.entry_date BETWEEN $1 AND $2 GROUP BY 1)
    SELECT m.month::text, coalesce(tx.mdr,0)::text AS mdr, coalesce(tx.wh,0)::text AS wh, coalesce(s.saas,0)::text AS saas, coalesce(g.rev,0)::text AS gl
    FROM (SELECT unnest($3::date[]) AS month) m LEFT JOIN tx USING (month) LEFT JOIN s USING (month) LEFT JOIN g USING (month) ORDER BY 1`, [start, end, months]);
  const otherRev = await q<any>(tx, `SELECT e.period::text AS month, sum(e.credit_base - e.debit_base)::text AS v FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id
     WHERE a.pl_line = 'revenue' AND a.revenue_stream = 'OTHER' AND e.entry_date BETWEEN $1 AND $2 GROUP BY 1`, [start, end]);
  const other = new Map(otherRev.map((r) => [r.month, r.v]));
  const breaks: string[] = [];
  for (const r of recon) {
    const engine = policy === 'agent_net' ? dec(r.mdr).minus(r.wh).plus(r.saas) : dec(r.mdr).plus(r.saas);
    const glTxn = dec(r.gl).minus(dec(other.get(r.month) ?? '0'));
    const diff = glTxn.minus(engine);
    if (diff.abs().gt(tol)) breaks.push(`${r.month.slice(0, 7)}: GL ${glTxn.toFixed(2)} vs engine ${engine.toFixed(2)} (Δ ${diff.toFixed(2)})`);
  }
  push({ code: 'C07', name: 'GL revenue ↔ transaction revenue reconciliation', category: 'Reconciliation discrepancies', status: breaks.length ? 'fail' : 'pass', affects: ['gl'], count: breaks.length, samples: breaks.slice(0, 5),
    detail: breaks.length ? `${breaks.length} month(s) where GL transaction revenue differs from the fee engine by more than ${tol.toString()} ${t.base_currency}` : `GL revenue reconciles to the fee engine within ${tol.toString()} ${t.base_currency} for every month` });

  // C08 Bank reconciliation exceptions open
  const rex = await one<any>(tx, `SELECT count(*)::int AS n FROM recon_exceptions x JOIN reconciliations r ON r.id = x.reconciliation_id WHERE x.status <> 'resolved' AND r.period BETWEEN date_trunc('month',$1::date) AND $2`, [start, end]);
  push({ code: 'C08', name: 'Open bank reconciliation exceptions', category: 'Reconciliation discrepancies', status: rex.n ? 'warn' : 'pass', affects: ['bank'], count: rex.n, samples: [],
    detail: rex.n ? `${rex.n} unresolved bank reconciliation exceptions in range (never auto-written-off)` : 'No open bank reconciliation exceptions' });

  // C09 Period alignment: accounting date before authorisation, or settlement before event
  const pm = await one<any>(tx, `SELECT count(*)::int AS n, (array_agg(external_ref))[1:5] AS samples FROM transactions
    WHERE accounting_date BETWEEN $1 AND $2 AND (accounting_date < event_at::date - 1 OR (settlement_date IS NOT NULL AND settlement_date < event_at::date))`, [start, end]);
  push({ code: 'C09', name: 'Period alignment (event / settlement / accounting dates)', category: 'Period misalignment', status: pm.n ? 'fail' : 'pass', affects: ['transactions'], count: pm.n, samples: pm.samples ?? [],
    detail: pm.n ? `${pm.n} transactions with accounting or settlement date before the event date` : 'Event ≤ settlement and accounting dates are aligned' });

  // C10 Journals balance
  const jb = await q<any>(tx, `SELECT journal_ref FROM gl_entries WHERE entry_date BETWEEN $1 AND $2 GROUP BY journal_ref HAVING sum(debit_base) <> sum(credit_base) LIMIT 5`, [start, end]);
  push({ code: 'C10', name: 'Journal balance (Σ debits = Σ credits)', category: 'Incorrect aggregation', status: jb.length ? 'fail' : 'pass', affects: ['gl'], count: jb.length, samples: jb.map((r) => r.journal_ref),
    detail: jb.length ? `${jb.length}+ unbalanced journals` : 'Every journal balances' });

  // C11 Missing GL months
  const glm = await q<any>(tx, `SELECT DISTINCT period::text AS p FROM gl_entries WHERE entry_date BETWEEN $1 AND $2`, [start, end]);
  const have = new Set(glm.map((r) => r.p));
  const missing = months.filter((m) => !have.has(m) && monthEnd(m) <= new Date().toISOString().slice(0, 10));
  push({ code: 'C11', name: 'General ledger completeness', category: 'Missing values', status: missing.length ? 'fail' : 'pass', affects: ['gl'], count: missing.length, samples: missing,
    detail: missing.length ? `No GL entries for ${missing.join(', ')}` : 'GL entries present for every completed month' });

  return out;
}
