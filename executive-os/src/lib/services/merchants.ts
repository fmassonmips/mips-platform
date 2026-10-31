/**
 * Merchant profitability engine (data layer). Transaction-level economics are
 * aggregated in Postgres; allocation and derived ratios use the decimal engine.
 */
import type { Tx } from '../db';
import { q, one } from '../db';
import { dec, safeDiv, ZERO, type Dec } from '../money';
import { allocate, type AllocationMethod } from '../engine/economics';
import { SAAS_CTE, tenantInfo, policyOf } from './facts';
import { addMonths, addDays, monthEnd } from '../dates';

export const GROUP_BY = {
  merchant: { label: 'Merchant', key: 'm.id::text', name: 'm.name', saas: true },
  group: { label: 'Merchant group', key: "coalesce(g.code,'(none)')", name: "coalesce(g.name,'(no group)')", saas: true },
  vertical: { label: 'Industry', key: "coalesce(v.code,'(none)')", name: "coalesce(v.name,'(unclassified)')", saas: true },
  segment: { label: 'Segment', key: 'm.segment', name: 'm.segment', saas: true },
  acquirer: { label: 'Acquirer', key: "coalesce(a.code,'NONE')", name: "coalesce(a.name,'(none)')", saas: false },
  method: { label: 'Payment method', key: 'pm.code', name: 'pm.name', saas: false },
  scheme: { label: 'Card scheme', key: "coalesce(t.card_scheme,'non-card')", name: "coalesce(initcap(t.card_scheme),'Non-card')", saas: false },
  region: { label: 'Domestic vs international', key: 't.card_region', name: 'initcap(t.card_region)', saas: false },
  txn_currency: { label: 'Transaction currency', key: 't.txn_currency', name: 't.txn_currency', saas: false },
  settlement_currency: { label: 'Settlement currency', key: 't.settlement_currency', name: 't.settlement_currency', saas: false },
  product: { label: 'Product', key: 'p.code', name: 'p.name', saas: false },
  month: { label: 'Month', key: "to_char(t.accounting_date,'YYYY-MM')", name: "to_char(t.accounting_date,'YYYY-MM')", saas: false },
} as const;
export type GroupBy = keyof typeof GROUP_BY;

export interface EconRow {
  key: string; name: string; gpv: string; attempts: string; successes: string; mdr: string; wholesale: string; processing: string; saas: string;
  netRevenue: string; contribution: string; contributionPct: string | null; overhead: string; netProfit: string;
  /** MIPS recognised revenue under the tenant policy: agent_net = MDR − wholesale + SaaS; principal_gross = MDR + SaaS */
  recognisedRevenue?: string;
  effectiveMdrBps: string | null; takeRateBps: string | null; wholesaleBps: string | null; avgTicket: string | null; revenuePerTxn: string | null; costPerTxn: string | null; successRate: string | null; revenueShare: string | null;
  meta?: Record<string, any>;
}

const s = (d: Dec | null) => (d === null ? null : d.toDecimalPlaces(6).toString());

export async function overheadPool(tx: Tx, start: string, end: string): Promise<Dec> {
  const r = await one<{ v: string }>(tx, `SELECT coalesce(sum(e.debit_base - e.credit_base),0)::text AS v FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id
    WHERE a.pl_line IN ('opex','d_and_a') AND e.entry_date BETWEEN $1 AND $2`, [start, end]);
  return dec(r?.v ?? 0);
}

export async function economicsBy(tx: Tx, start: string, end: string, groupBy: GroupBy, opts: { merchantId?: string; allocation?: AllocationMethod } = {}): Promise<{ rows: EconRow[]; totals: EconRow; overheadPool: string; allocation: AllocationMethod; policy: string }> {
  const t = await tenantInfo(tx);
  const g = GROUP_BY[groupBy];
  const params: unknown[] = [start, end];
  let filter = '';
  if (opts.merchantId) { params.push(opts.merchantId); filter = ` AND t.merchant_id = $${params.length}`; }
  const rows = await q<any>(tx, `SELECT ${g.key} AS key, min(${g.name}) AS name,
      coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv, count(*)::text AS attempts, count(*) FILTER (WHERE t.status='success')::text AS successes,
      sum(t.mdr_fee_base)::text AS mdr, sum(t.wholesale_fee_base)::text AS wholesale, sum(t.processing_cost_base)::text AS processing
    FROM transactions t JOIN merchants m ON m.id = t.merchant_id LEFT JOIN merchant_groups g ON g.id = m.group_id LEFT JOIN verticals v ON v.id = m.vertical_id
    LEFT JOIN acquirers a ON a.id = t.acquirer_id JOIN payment_methods pm ON pm.id = t.payment_method_id JOIN products p ON p.id = t.product_id
    WHERE t.accounting_date BETWEEN $1 AND $2${filter} GROUP BY 1`, params);
  const saasMap = new Map<string, string>();
  if (g.saas) {
    const sr = await q<any>(tx, `WITH ${SAAS_CTE} SELECT ${g.key} AS key, min(${g.name}) AS name, sum(s.fee)::text AS saas FROM saas s JOIN merchants m ON m.id = s.merchant_id
      LEFT JOIN merchant_groups g ON g.id = m.group_id LEFT JOIN verticals v ON v.id = m.vertical_id ${opts.merchantId ? 'WHERE m.id = $3' : ''} GROUP BY 1`, opts.merchantId ? [start, end, opts.merchantId] : [start, end]);
    for (const r of sr) { saasMap.set(r.key, r.saas); if (!rows.find((x) => x.key === r.key)) rows.push({ key: r.key, name: r.name, gpv: '0', attempts: '0', successes: '0', mdr: '0', wholesale: '0', processing: '0' }); }
  }
  const allocation: AllocationMethod = opts.allocation ?? (t.settings?.overhead_allocation as AllocationMethod) ?? 'by_revenue';
  const pool = opts.merchantId ? await merchantOverheadShare(tx, start, end, opts.merchantId, allocation) : await overheadPool(tx, start, end);
  const base = rows.map((r) => {
    const saas = dec(saasMap.get(r.key) ?? 0);
    const net = dec(r.mdr).minus(r.wholesale).plus(saas);
    return { r, saas, net, contribution: net.minus(r.processing) };
  });
  const drivers: Record<string, Dec> = {};
  for (const b of base) {
    const d = allocation === 'by_transactions' ? dec(b.r.successes) : allocation === 'by_gpv' ? dec(b.r.gpv) : b.net;
    drivers[b.r.key] = d.gt(0) ? d : ZERO;
  }
  const alloc = opts.merchantId ? { [base[0]?.r.key ?? '']: pool } : allocation === 'none' ? {} : allocate(pool, drivers);
  const totalNet = base.reduce((a, b) => a.plus(b.net), ZERO);
  const policy = policyOf(t);
  const out: EconRow[] = base.map(({ r, saas, net, contribution }) => {
    const gpv = dec(r.gpv), succ = dec(r.successes), oh = dec((alloc as any)[r.key] ?? 0);
    const bps = (x: Dec) => { const v = safeDiv(x, gpv); return v ? v.times(10000) : null; };
    return {
      key: r.key, name: r.name, gpv: r.gpv, attempts: r.attempts, successes: r.successes, mdr: r.mdr, wholesale: r.wholesale, processing: r.processing, saas: saas.toString(),
      netRevenue: net.toString(), contribution: contribution.toString(), contributionPct: s(safeDiv(contribution, net)), overhead: oh.toString(), netProfit: contribution.minus(oh).toString(),
      recognisedRevenue: (policy === 'principal_gross' ? dec(r.mdr).plus(saas) : net).toString(),
      effectiveMdrBps: s(bps(dec(r.mdr))), takeRateBps: s(bps(dec(r.mdr).minus(r.wholesale))), wholesaleBps: s(bps(dec(r.wholesale))), avgTicket: s(safeDiv(gpv, succ)),
      revenuePerTxn: s(safeDiv(net, succ)), costPerTxn: s(safeDiv(dec(r.wholesale).plus(r.processing), succ)), successRate: s(safeDiv(succ, r.attempts)), revenueShare: s(safeDiv(net, totalNet)),
    };
  }).sort((a, b) => dec(b.contribution).cmp(dec(a.contribution)));
  const tot = (k: keyof EconRow) => out.reduce((a, r) => a.plus(dec(r[k] as string)), ZERO);
  const T = { gpv: tot('gpv'), mdr: tot('mdr'), wh: tot('wholesale'), proc: tot('processing'), saas: tot('saas'), succ: tot('successes'), att: tot('attempts'), net: tot('netRevenue'), cm: tot('contribution'), oh: tot('overhead') };
  const tb = (x: Dec) => { const v = safeDiv(x, T.gpv); return v ? v.times(10000) : null; };
  const totals: EconRow = { key: 'total', name: 'Total', gpv: T.gpv.toString(), attempts: T.att.toString(), successes: T.succ.toString(), mdr: T.mdr.toString(), wholesale: T.wh.toString(), processing: T.proc.toString(), saas: T.saas.toString(), netRevenue: T.net.toString(), contribution: T.cm.toString(), contributionPct: s(safeDiv(T.cm, T.net)), overhead: T.oh.toString(), netProfit: T.cm.minus(T.oh).toString(), recognisedRevenue: out.reduce((a, r) => a.plus(dec(r.recognisedRevenue ?? 0)), ZERO).toString(), effectiveMdrBps: s(tb(T.mdr)), takeRateBps: s(tb(T.mdr.minus(T.wh))), wholesaleBps: s(tb(T.wh)), avgTicket: s(safeDiv(T.gpv, T.succ)), revenuePerTxn: s(safeDiv(T.net, T.succ)), costPerTxn: s(safeDiv(T.wh.plus(T.proc), T.succ)), successRate: s(safeDiv(T.succ, T.att)), revenueShare: T.net.isZero() ? null : '1' };
  return { rows: out, totals, overheadPool: pool.toString(), allocation, policy };
}

/** A single merchant's share of the overhead pool under the portfolio allocation. */
async function merchantOverheadShare(tx: Tx, start: string, end: string, merchantId: string, method: AllocationMethod): Promise<Dec> {
  if (method === 'none') return ZERO;
  const all = await economicsBy(tx, start, end, 'merchant', { allocation: method });
  return dec(all.rows.find((r) => r.key === merchantId)?.overhead ?? 0);
}

export async function merchantList(tx: Tx) {
  return q<any>(tx, `SELECT m.id, m.code, m.name, m.segment, m.status, m.activated_at, m.churned_at, m.commercial_importance, m.churn_risk, m.growth_potential, m.price_locked_until, m.contract_notes, m.contract_end_date,
      v.name AS vertical, g.name AS group_name FROM merchants m LEFT JOIN verticals v ON v.id = m.vertical_id LEFT JOIN merchant_groups g ON g.id = m.group_id ORDER BY m.name`);
}

export async function merchantMonthly(tx: Tx, merchantId: string, fromMonth: string, toMonth: string) {
  const rows = await q<any>(tx, `WITH ${SAAS_CTE}, s AS (SELECT month, sum(fee) AS saas FROM saas WHERE merchant_id = $3 GROUP BY 1),
    tx AS (SELECT date_trunc('month', accounting_date)::date AS month, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, count(*) AS attempts, count(*) FILTER (WHERE status='success') AS successes,
      sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wholesale, sum(processing_cost_base) AS processing,
      coalesce(sum(amount_base) FILTER (WHERE status='success' AND card_region='international'),0) AS intl_gpv,
      coalesce(sum(wholesale_fee_base) FILTER (WHERE card_region='international'),0) AS intl_wholesale
      FROM transactions WHERE merchant_id = $3 AND accounting_date BETWEEN $1 AND $2 GROUP BY 1)
    SELECT m.month::text AS month, coalesce(tx.gpv,0)::text AS gpv, coalesce(tx.attempts,0)::text AS attempts, coalesce(tx.successes,0)::text AS successes, coalesce(tx.mdr,0)::text AS mdr, coalesce(tx.wholesale,0)::text AS wholesale,
      coalesce(tx.processing,0)::text AS processing, coalesce(s.saas,0)::text AS saas, coalesce(tx.intl_gpv,0)::text AS intl_gpv, coalesce(tx.intl_wholesale,0)::text AS intl_wholesale
    FROM (SELECT generate_series($1::date, $4::date, interval '1 month')::date AS month) m LEFT JOIN tx USING (month) LEFT JOIN s USING (month) ORDER BY 1`, [fromMonth, monthEnd(toMonth), merchantId, toMonth]);
  return rows.map((r) => {
    const gpv = dec(r.gpv); const net = dec(r.mdr).minus(r.wholesale).plus(r.saas); const cm = net.minus(r.processing);
    const bps = (x: string) => { const v = safeDiv(x, gpv); return v ? v.times(10000).toDecimalPlaces(2).toString() : null; };
    const ib = safeDiv(r.intl_wholesale, r.intl_gpv);
    return { ...r, netRevenue: net.toString(), contribution: cm.toString(), effectiveMdrBps: bps(r.mdr), wholesaleBps: bps(r.wholesale), takeRateBps: bps(dec(r.mdr).minus(r.wholesale).toString()), intlWholesaleBps: ib ? ib.times(10000).toDecimalPlaces(2).toString() : null };
  });
}

export interface MarginAlert { merchantId: string; code: string; name: string; month: string; kind: 'margin_decline' | 'loss_making'; contribution: string; baseline: string; unitMarginBps: string; baselineUnitMarginBps: string; change: string; changePct: string | null; drivers: { wholesaleBps: string; mdrBps: string; volumePct: string | null }; primaryDriver: string }

/**
 * Margin alerts (ALERT v2). Compares the latest month's UNIT contribution margin
 * (contribution / GPV, in bps) with the average of the previous 6 months, so that
 * seasonal volume swings do not trigger alerts. Impact = Δ unit margin × current GPV.
 * Merchants already loss-making in the baseline are reported separately.
 */
export async function marginAlerts(tx: Tx, month: string, thresholdPct = '0.10'): Promise<MarginAlert[]> {
  const from = addMonths(month, -6);
  const rows = await q<any>(tx, `SELECT m.id, m.code, m.name, date_trunc('month', t.accounting_date)::date::text AS month,
      coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv, sum(t.mdr_fee_base)::text AS mdr, sum(t.wholesale_fee_base)::text AS wholesale, sum(t.processing_cost_base)::text AS processing
    FROM transactions t JOIN merchants m ON m.id = t.merchant_id WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1,2,3,4`, [from, monthEnd(month)]);
  const by = new Map<string, any[]>();
  for (const r of rows) by.set(r.id, [...(by.get(r.id) ?? []), r]);
  const out: MarginAlert[] = [];
  const S = (xs: any[], k: string) => xs.reduce((a, x) => a.plus(dec(x[k])), ZERO);
  for (const [id, list] of by) {
    const cur = list.find((x) => x.month === month); const prev = list.filter((x) => x.month < month);
    if (!cur || prev.length < 3 || dec(cur.gpv).isZero()) continue;
    const cmOf = (mdr: Dec, wh: Dec, pr: Dec) => mdr.minus(wh).minus(pr);
    const pg = S(prev, 'gpv'); if (pg.isZero()) continue;
    const baseCm = cmOf(S(prev, 'mdr'), S(prev, 'wholesale'), S(prev, 'processing'));
    const baseUnit = baseCm.div(pg).times(10000);
    const c = cmOf(dec(cur.mdr), dec(cur.wholesale), dec(cur.processing));
    const unit = c.div(cur.gpv).times(10000);
    const wbps = dec(cur.wholesale).div(cur.gpv).minus(S(prev, 'wholesale').div(pg)).times(10000);
    const mbps = dec(cur.mdr).div(cur.gpv).minus(S(prev, 'mdr').div(pg)).times(10000);
    const avgGpv = pg.div(prev.length); const vol = safeDiv(dec(cur.gpv).minus(avgGpv), avgGpv);
    const impact = unit.minus(baseUnit).div(10000).times(cur.gpv);
    const common = { merchantId: id, code: list[0].code, name: list[0].name, month, contribution: c.toFixed(2), baseline: baseCm.div(prev.length).toFixed(2), unitMarginBps: unit.toFixed(2), baselineUnitMarginBps: baseUnit.toFixed(2), change: impact.toFixed(2), drivers: { wholesaleBps: wbps.toFixed(2), mdrBps: mbps.toFixed(2), volumePct: vol ? vol.toFixed(4) : null } };
    if (baseCm.lte(0)) { if (c.lt(0)) out.push({ ...common, kind: 'loss_making', changePct: null, primaryDriver: 'Contribution negative: MDR below wholesale + processing cost' }); continue; }
    const pct = safeDiv(unit.minus(baseUnit), baseUnit);
    if (!pct || pct.gt(dec(thresholdPct).neg())) continue;
    const primary = wbps.gt(3) ? 'Wholesale processing cost increase' : mbps.lt(-3) ? 'MDR reduction' : 'Payment-method / region mix';
    out.push({ ...common, kind: 'margin_decline', changePct: pct.toFixed(4), primaryDriver: primary });
  }
  return out.sort((a, b) => (a.kind === b.kind ? dec(a.change).cmp(dec(b.change)) : a.kind === 'margin_decline' ? -1 : 1));
}

export interface TxnFilter { limit?: number; offset?: number; region?: string; acquirer?: string; status?: string; method?: string; feeScheduleId?: string; pricingAgreementId?: string }

function txnWhere(merchantId: string, start: string, end: string, opts: TxnFilter) {
  const params: unknown[] = [merchantId, start, end]; const f: string[] = [];
  if (opts.region) { params.push(opts.region); f.push(`t.card_region = $${params.length}`); }
  if (opts.acquirer) { params.push(opts.acquirer); f.push(`a.code = $${params.length}`); }
  if (opts.status) { params.push(opts.status); f.push(`t.status = $${params.length}`); }
  if (opts.method) { params.push(opts.method); f.push(`pm.code = $${params.length}`); }
  if (opts.feeScheduleId) { params.push(opts.feeScheduleId); f.push(`t.fee_schedule_id = $${params.length}::uuid`); }
  if (opts.pricingAgreementId) { params.push(opts.pricingAgreementId); f.push(`t.pricing_agreement_id = $${params.length}::uuid`); }
  return { params, where: `t.merchant_id = $1 AND t.accounting_date BETWEEN $2 AND $3 ${f.length ? 'AND ' + f.join(' AND ') : ''}` };
}
const TXN_FROM = `FROM transactions t JOIN payment_methods pm ON pm.id = t.payment_method_id LEFT JOIN acquirers a ON a.id = t.acquirer_id JOIN products p ON p.id = t.product_id
    LEFT JOIN pricing_agreements pa ON pa.id = t.pricing_agreement_id LEFT JOIN fee_schedules fs ON fs.id = t.fee_schedule_id LEFT JOIN import_batches ib ON ib.id = t.import_batch_id`;

export async function merchantTransactions(tx: Tx, merchantId: string, start: string, end: string, opts: TxnFilter = {}) {
  const { params, where } = txnWhere(merchantId, start, end, opts);
  params.push(opts.limit ?? 200, opts.offset ?? 0);
  return q<any>(tx, `SELECT t.id, t.external_ref, t.event_at, t.accounting_date, t.settlement_date, t.status, t.card_scheme, t.card_region, pm.name AS method, a.code AS acquirer, p.code AS product,
      t.txn_currency, t.settlement_currency, t.amount::text, t.fx_rate_to_base::text, t.amount_base::text, t.mdr_fee_base::text, t.wholesale_fee_base::text, t.processing_cost_base::text,
      (t.mdr_fee_base - t.wholesale_fee_base - t.processing_cost_base)::text AS contribution,
      pa.id AS pricing_agreement_id, pa.contract_ref AS pricing_ref, pa.mdr_bps::text AS mdr_bps, fs.id AS fee_schedule_id, fs.schedule_ref AS fee_ref, fs.wholesale_bps::text AS wholesale_bps,
      ib.filename AS source_file, t.import_batch_id, t.source_row_id, t.is_demo
    ${TXN_FROM}
    WHERE ${where}
    ORDER BY t.event_at DESC, t.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
}

/** Count + totals of the filtered drill-down (for pagination and the totals line). */
export async function merchantTransactionsSummary(tx: Tx, merchantId: string, start: string, end: string, opts: TxnFilter = {}) {
  const { params, where } = txnWhere(merchantId, start, end, opts);
  return (await one<any>(tx, `SELECT count(*)::text AS n, coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv, coalesce(sum(t.mdr_fee_base),0)::text AS mdr,
      coalesce(sum(t.wholesale_fee_base),0)::text AS wholesale, coalesce(sum(t.processing_cost_base),0)::text AS processing,
      coalesce(sum(t.mdr_fee_base - t.wholesale_fee_base - t.processing_cost_base),0)::text AS contribution
    ${TXN_FROM} WHERE ${where}`, params))!;
}

/** Distinct filter values present in a merchant's transactions. */
export async function merchantTxnFacets(tx: Tx, merchantId: string) {
  const r = await one<any>(tx, `SELECT array_agg(DISTINCT a.code) FILTER (WHERE a.code IS NOT NULL) AS acquirers, array_agg(DISTINCT pm.code) AS methods, array_agg(DISTINCT t.card_region) AS regions, array_agg(DISTINCT t.status) AS statuses
    FROM transactions t LEFT JOIN acquirers a ON a.id = t.acquirer_id JOIN payment_methods pm ON pm.id = t.payment_method_id WHERE t.merchant_id = $1`, [merchantId]);
  return { acquirers: (r?.acquirers ?? []) as string[], methods: (r?.methods ?? []) as string[], regions: (r?.regions ?? []) as string[], statuses: (r?.statuses ?? []) as string[] };
}

export async function merchantAgreements(tx: Tx, merchantId: string) {
  return q<any>(tx, `SELECT pa.id, pa.contract_ref, coalesce(pm.name,'All methods') AS method, pa.card_region, pa.mdr_bps::text, pa.fixed_fee::text, pa.monthly_saas_fee::text, pa.effective_from, pa.effective_to, u.name AS approved_by
    FROM pricing_agreements pa LEFT JOIN payment_methods pm ON pm.id = pa.payment_method_id LEFT JOIN users u ON u.id = pa.approved_by WHERE pa.merchant_id = $1 ORDER BY pa.effective_from DESC, method`, [merchantId]);
}

/** Fee schedules actually applied to a merchant's transactions in the range. */
export async function merchantFeeSchedules(tx: Tx, merchantId: string, start: string, end: string) {
  return q<any>(tx, `SELECT fs.id, fs.schedule_ref, a.code AS acquirer, coalesce(pm.name,'All methods') AS method, fs.card_region, fs.wholesale_bps::text, fs.effective_from, fs.effective_to,
      count(t.id)::text AS txns, sum(t.wholesale_fee_base)::text AS wholesale
    FROM transactions t JOIN fee_schedules fs ON fs.id = t.fee_schedule_id JOIN acquirers a ON a.id = fs.acquirer_id LEFT JOIN payment_methods pm ON pm.id = fs.payment_method_id
    WHERE t.merchant_id = $1 AND t.accounting_date BETWEEN $2 AND $3 GROUP BY fs.id, a.code, pm.name ORDER BY fs.effective_from DESC, a.code`, [merchantId, start, end]);
}

// ===========================================================================
// Extensions (Merchant Intelligence / Product Profitability / Break-Even)
// ===========================================================================

export async function merchantInfo(tx: Tx, merchantId: string) {
  return one<any>(tx, `SELECT m.id, m.code, m.name, m.segment, m.status, m.country, m.activated_at, m.churned_at, m.commercial_importance, m.churn_risk, m.growth_potential,
      m.price_locked_until, m.contract_notes, m.contract_end_date, v.name AS vertical, g.name AS group_name, g.code AS group_code
    FROM merchants m LEFT JOIN verticals v ON v.id = m.vertical_id LEFT JOIN merchant_groups g ON g.id = m.group_id WHERE m.id = $1`, [merchantId]);
}

/** Monthly economics for every merchant (one query), incl. SaaS from active pricing agreements. Months ascending. */
export async function portfolioMonthly(tx: Tx, fromMonth: string, toMonth: string): Promise<Map<string, { month: string; gpv: string; successes: string; mdr: string; wholesale: string; processing: string; saas: string }[]>> {
  const rows = await q<any>(tx, `WITH ${SAAS_CTE}, s AS (SELECT merchant_id, month, sum(fee) AS saas FROM saas GROUP BY 1,2),
    tx AS (SELECT merchant_id, date_trunc('month', accounting_date)::date AS month, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, count(*) FILTER (WHERE status='success') AS successes,
      sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wholesale, sum(processing_cost_base) AS processing
      FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1,2),
    grid AS (SELECT m.id AS merchant_id, g.month FROM merchants m CROSS JOIN (SELECT generate_series($1::date, $3::date, interval '1 month')::date AS month) g)
    SELECT grid.merchant_id::text AS merchant_id, grid.month::text AS month, coalesce(tx.gpv,0)::text AS gpv, coalesce(tx.successes,0)::text AS successes, coalesce(tx.mdr,0)::text AS mdr,
      coalesce(tx.wholesale,0)::text AS wholesale, coalesce(tx.processing,0)::text AS processing, coalesce(s.saas,0)::text AS saas
    FROM grid LEFT JOIN tx USING (merchant_id, month) LEFT JOIN s USING (merchant_id, month) ORDER BY 1, 2`, [fromMonth, monthEnd(toMonth), toMonth]);
  const out = new Map<string, any[]>();
  for (const r of rows) { const { merchant_id, ...rest } = r; if (!out.has(merchant_id)) out.set(merchant_id, []); out.get(merchant_id)!.push(rest); }
  return out;
}

/** Wholesale / MDR by month × acquirer × card region for one merchant — locates the source of a wholesale change. */
export async function merchantRateBreakdown(tx: Tx, merchantId: string, start: string, end: string) {
  return q<any>(tx, `SELECT date_trunc('month', t.accounting_date)::date::text AS month, coalesce(a.code,'NONE') AS acquirer, t.card_region AS region,
      count(*) FILTER (WHERE t.status='success')::text AS successes, coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv,
      sum(t.mdr_fee_base)::text AS mdr, sum(t.wholesale_fee_base)::text AS wholesale,
      (sum(t.mdr_fee_base) / nullif(sum(t.amount_base) FILTER (WHERE t.status='success'),0) * 10000)::numeric(12,2)::text AS mdr_bps,
      (sum(t.wholesale_fee_base) / nullif(sum(t.amount_base) FILTER (WHERE t.status='success'),0) * 10000)::numeric(12,2)::text AS wholesale_bps,
      string_agg(DISTINCT fs.schedule_ref, ' | ') AS fee_refs
    FROM transactions t LEFT JOIN acquirers a ON a.id = t.acquirer_id LEFT JOIN fee_schedules fs ON fs.id = t.fee_schedule_id
    WHERE t.merchant_id = $1 AND t.accounting_date BETWEEN $2 AND $3 GROUP BY 1,2,3 ORDER BY 1,2,3`, [merchantId, start, end]);
}

/** Independent control totals straight from the source tables (used to prove table totals = Σ rows = source). */
export async function controlTotals(tx: Tx, start: string, end: string) {
  const r = await one<any>(tx, `WITH ${SAAS_CTE}, x AS (SELECT coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, count(*) FILTER (WHERE status='success') AS successes,
        coalesce(sum(mdr_fee_base),0) AS mdr, coalesce(sum(wholesale_fee_base),0) AS wholesale, coalesce(sum(processing_cost_base),0) AS processing
      FROM transactions WHERE accounting_date BETWEEN $1 AND $2)
    SELECT x.gpv::text AS gpv, x.successes::text AS successes, x.mdr::text AS mdr, x.wholesale::text AS wholesale, x.processing::text AS processing,
      (SELECT coalesce(sum(fee),0) FROM saas)::text AS saas FROM x`, [start, end]);
  return r as { gpv: string; successes: string; mdr: string; wholesale: string; processing: string; saas: string };
}

// ---------------------------------------------------------------------------
// Product profitability
// ---------------------------------------------------------------------------
export interface ProductRow {
  key: string; name: string; channel: string; transactional: boolean;
  attempts: string; successes: string; gpv: string; mdr: string; wholesale: string; nonTxnRevenue: string; glPosted: string;
  recognisedRevenue: string; netRevenue: string; processing: string; infra: string; otherDirect: string;
  contribution: string; contributionPct: string | null; overhead: string; profit: string; profitPct: string | null; revenuePerTxn: string | null;
}
export interface ProductProfitability {
  rows: ProductRow[]; totals: ProductRow; policy: string;
  infraPool: string; infraMethod: AllocationMethod; overheadPool: string; overheadGross: string; overheadMethod: AllocationMethod;
  checks: { infraAllocated: string; overheadAllocated: string };
}

type Driverable = { key: string; attempts: Dec; gpv: Dec; rev: Dec };
function drivers(items: Driverable[], method: AllocationMethod, kind: 'infra' | 'overhead'): Record<string, Dec> {
  const d: Record<string, Dec> = {};
  for (const i of items) {
    const v = method === 'by_transactions' ? i.attempts : method === 'by_gpv' ? i.gpv : i.rev;
    d[i.key] = v.gt(0) ? v : ZERO;
  }
  void kind; return d;
}

/**
 * Product profitability (PRODUCT-PNL v1).
 *  Transactional products: MDR, wholesale and direct processing from the fee engine (transactions).
 *  Non-transactional products: GL revenue accounts other than 4000 (4100 SaaS, 4200 payouts/reconciliation) by product_id.
 *  Infrastructure: GL cost_category 'cloud' in the period, allocated by `infraMethod` (default by transactions).
 *  Other attributable: GL expense entries tagged with a product_id (excluding cloud).
 *  Overhead pool: GL opex + D&A MINUS the infrastructure already allocated (no double count), allocated by `overheadMethod`.
 */
export async function productProfitability(tx: Tx, start: string, end: string, opts: { infraMethod?: AllocationMethod; overheadMethod?: AllocationMethod } = {}): Promise<ProductProfitability> {
  const t = await tenantInfo(tx); const policy = policyOf(t);
  const infraMethod = opts.infraMethod ?? 'by_transactions';
  const overheadMethod = opts.overheadMethod ?? ((t.settings?.overhead_allocation as AllocationMethod) || 'by_revenue');
  const prods = await q<any>(tx, `SELECT p.id, p.code, p.name, p.channel, p.is_transactional,
      coalesce(x.attempts,0)::text AS attempts, coalesce(x.successes,0)::text AS successes, coalesce(x.gpv,0)::text AS gpv, coalesce(x.mdr,0)::text AS mdr, coalesce(x.wholesale,0)::text AS wholesale, coalesce(x.processing,0)::text AS processing,
      coalesce(gl.non_txn,0)::text AS non_txn, coalesce(gl.posted_txn,0)::text AS posted_txn, coalesce(gl.other_direct,0)::text AS other_direct
    FROM products p
    LEFT JOIN (SELECT product_id, count(*) AS attempts, count(*) FILTER (WHERE status='success') AS successes, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv,
        sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wholesale, sum(processing_cost_base) AS processing FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1) x ON x.product_id = p.id
    LEFT JOIN (SELECT e.product_id,
        sum(e.credit_base - e.debit_base) FILTER (WHERE a.pl_line='revenue' AND coalesce(a.revenue_stream,'') <> 'TXN') AS non_txn,
        sum(e.credit_base - e.debit_base) FILTER (WHERE a.pl_line='revenue' AND a.revenue_stream = 'TXN') AS posted_txn,
        sum(e.debit_base - e.credit_base) FILTER (WHERE a.pl_line IN ('cost_of_sales','opex') AND coalesce(a.cost_category,'') <> 'cloud') AS other_direct
      FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2 AND e.product_id IS NOT NULL GROUP BY 1) gl ON gl.product_id = p.id
    WHERE p.is_active ORDER BY p.is_transactional DESC, p.code`, [start, end]);
  const pools = await one<any>(tx, `SELECT coalesce(sum(e.debit_base - e.credit_base) FILTER (WHERE a.cost_category = 'cloud'),0)::text AS cloud,
      coalesce(sum(e.debit_base - e.credit_base) FILTER (WHERE a.pl_line IN ('opex','d_and_a')),0)::text AS overhead,
      coalesce(sum(e.debit_base - e.credit_base) FILTER (WHERE a.pl_line IN ('opex','d_and_a') AND e.product_id IS NOT NULL AND coalesce(a.cost_category,'') <> 'cloud'),0)::text AS tagged_opex
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2`, [start, end]);
  const base = prods.map((p) => {
    const mdr = dec(p.mdr), wh = dec(p.wholesale), nonTxn = dec(p.non_txn);
    const net = mdr.minus(wh).plus(nonTxn);
    const rec = policy === 'principal_gross' ? mdr.plus(nonTxn) : net;
    return { p, key: p.code as string, attempts: dec(p.attempts), gpv: dec(p.gpv), rev: rec, net, rec };
  });
  const infraPool = dec(pools!.cloud);
  const infraAlloc = infraMethod === 'none' ? {} as Record<string, Dec> : allocate(infraPool, drivers(base, infraMethod, 'infra'));
  // Overhead pool excludes infra that was allocated and opex already attributed to a product.
  const overheadGross = dec(pools!.overhead);
  const overheadPoolAmt = overheadGross.minus(infraMethod === 'none' ? ZERO : infraPool).minus(dec(pools!.tagged_opex));
  const ohAlloc = overheadMethod === 'none' ? {} as Record<string, Dec> : allocate(overheadPoolAmt, drivers(base, overheadMethod, 'overhead'));
  const rows: ProductRow[] = base.map((b) => {
    const p = b.p; const infra = dec((infraAlloc as any)[b.key] ?? 0), oh = dec((ohAlloc as any)[b.key] ?? 0);
    const other = dec(p.other_direct);
    const contribution = b.net.minus(dec(p.processing)).minus(infra).minus(other);
    const profit = contribution.minus(oh);
    return {
      key: b.key, name: p.name, channel: p.channel, transactional: p.is_transactional, attempts: p.attempts, successes: p.successes, gpv: p.gpv, mdr: p.mdr, wholesale: p.wholesale,
      nonTxnRevenue: p.non_txn, glPosted: p.posted_txn, recognisedRevenue: b.rec.toString(), netRevenue: b.net.toString(), processing: p.processing, infra: infra.toString(), otherDirect: other.toString(),
      contribution: contribution.toString(), contributionPct: s(safeDiv(contribution, b.rec)), overhead: oh.toString(), profit: profit.toString(), profitPct: s(safeDiv(profit, b.rec)), revenuePerTxn: s(safeDiv(b.rec, p.successes)),
    };
  });
  const T = (k: keyof ProductRow) => rows.reduce((a, r) => a.plus(dec(r[k] as string)), ZERO);
  const tc = T('contribution'), tr = T('recognisedRevenue'), tp = T('profit');
  const totals: ProductRow = { key: 'total', name: 'Total', channel: '', transactional: true, attempts: T('attempts').toString(), successes: T('successes').toString(), gpv: T('gpv').toString(), mdr: T('mdr').toString(), wholesale: T('wholesale').toString(), nonTxnRevenue: T('nonTxnRevenue').toString(), glPosted: T('glPosted').toString(), recognisedRevenue: tr.toString(), netRevenue: T('netRevenue').toString(), processing: T('processing').toString(), infra: T('infra').toString(), otherDirect: T('otherDirect').toString(), contribution: tc.toString(), contributionPct: s(safeDiv(tc, tr)), overhead: T('overhead').toString(), profit: tp.toString(), profitPct: s(safeDiv(tp, tr)), revenuePerTxn: s(safeDiv(tr, T('successes'))) };
  return { rows, totals, policy, infraPool: infraPool.toString(), infraMethod, overheadPool: overheadPoolAmt.toString(), overheadGross: overheadGross.toString(), overheadMethod, checks: { infraAllocated: T('infra').toString(), overheadAllocated: T('overhead').toString() } };
}

export const METHOD_CATEGORY_LABEL: Record<string, string> = { card: 'Card payments', qr: 'QR payments (MauCAS)', wallet: 'Digital wallets', bank_transfer: 'Bank transfers', other: 'Other methods' };

/** Payment-method category view (card / QR / wallet): transaction economics + infrastructure allocated by `infraMethod`. */
export async function methodCategoryEconomics(tx: Tx, start: string, end: string, infraMethod: AllocationMethod = 'by_transactions') {
  const t = await tenantInfo(tx); const policy = policyOf(t);
  const rows = await q<any>(tx, `SELECT pm.category AS key, count(*)::text AS attempts, count(*) FILTER (WHERE t.status='success')::text AS successes,
      coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv, sum(t.mdr_fee_base)::text AS mdr, sum(t.wholesale_fee_base)::text AS wholesale, sum(t.processing_cost_base)::text AS processing,
      string_agg(DISTINCT pm.name, ', ') AS methods
    FROM transactions t JOIN payment_methods pm ON pm.id = t.payment_method_id WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [start, end]);
  const cloud = await one<any>(tx, `SELECT coalesce(sum(e.debit_base - e.credit_base),0)::text AS v FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE a.cost_category = 'cloud' AND e.entry_date BETWEEN $1 AND $2`, [start, end]);
  const items = rows.map((r) => { const net = dec(r.mdr).minus(r.wholesale); return { r, key: r.key as string, attempts: dec(r.attempts), gpv: dec(r.gpv), rev: policy === 'principal_gross' ? dec(r.mdr) : net, net }; });
  const alloc = infraMethod === 'none' ? {} as Record<string, Dec> : allocate(dec(cloud!.v), drivers(items, infraMethod, 'infra'));
  return {
    infraPool: cloud!.v, infraMethod, policy,
    rows: items.map((i) => {
      const infra = dec((alloc as any)[i.key] ?? 0); const cm = i.net.minus(i.r.processing).minus(infra);
      const bps = (x: Dec) => { const v = safeDiv(x, i.gpv); return v ? v.times(10000) : null; };
      return { key: i.key, name: METHOD_CATEGORY_LABEL[i.key] ?? i.key, methods: i.r.methods, attempts: i.r.attempts, successes: i.r.successes, gpv: i.r.gpv, mdr: i.r.mdr, wholesale: i.r.wholesale, recognisedRevenue: i.rev.toString(), netRevenue: i.net.toString(), processing: i.r.processing, infra: infra.toString(), contribution: cm.toString(), contributionPct: s(safeDiv(cm, i.rev)), effectiveMdrBps: s(bps(dec(i.r.mdr))), takeRateBps: s(bps(i.net)), revenuePerTxn: s(safeDiv(i.rev, i.r.successes)), costPerTxn: s(safeDiv(dec(i.r.wholesale).plus(i.r.processing).plus(infra), i.r.successes)) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Break-even base
// ---------------------------------------------------------------------------
export interface BreakEvenMonth { month: string; gpv: string; successes: string; activeMerchants: string; mdr: string; wholesale: string; processing: string; saas: string; otherRevenue: string; opex: string; dAndA: string; loanRepayments: string }
export interface BreakEvenBaseData { months: BreakEvenMonth[]; avg: Omit<BreakEvenMonth, 'month'> }

/** Trailing n months ending at endMonth: monthly figures and monthly averages (decimal strings). */
export async function breakEvenBase(tx: Tx, endMonth: string, n = 3): Promise<BreakEvenBaseData> {
  const fromMonth = addMonths(endMonth, -(n - 1));
  const end = monthEnd(endMonth);
  const months = await q<BreakEvenMonth>(tx, `WITH ${SAAS_CTE},
    g AS (SELECT generate_series($1::date, $3::date, interval '1 month')::date AS month),
    x AS (SELECT date_trunc('month', accounting_date)::date AS month, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, count(*) FILTER (WHERE status='success') AS successes,
        count(DISTINCT merchant_id) FILTER (WHERE status='success') AS active, sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wholesale, sum(processing_cost_base) AS processing
      FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1),
    sa AS (SELECT month, sum(fee) AS saas FROM saas GROUP BY 1),
    gl AS (SELECT e.period AS month,
        sum(e.debit_base - e.credit_base) FILTER (WHERE a.pl_line = 'opex') AS opex,
        sum(e.debit_base - e.credit_base) FILTER (WHERE a.pl_line = 'd_and_a') AS da,
        sum(e.credit_base - e.debit_base) FILTER (WHERE a.pl_line = 'revenue' AND a.revenue_stream = 'OTHER') AS other_rev
      FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2 GROUP BY 1),
    bk AS (SELECT date_trunc('month', bt.txn_date)::date AS month, -sum(bt.amount) FILTER (WHERE bt.category = 'loan' AND bt.amount < 0) AS loan
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id WHERE ba.account_class = 'operating' AND bt.txn_date BETWEEN $1 AND $2 GROUP BY 1)
    SELECT g.month::text AS month, coalesce(x.gpv,0)::text AS gpv, coalesce(x.successes,0)::text AS successes, coalesce(x.active,0)::text AS "activeMerchants", coalesce(x.mdr,0)::text AS mdr,
      coalesce(x.wholesale,0)::text AS wholesale, coalesce(x.processing,0)::text AS processing, coalesce(sa.saas,0)::text AS saas, coalesce(gl.other_rev,0)::text AS "otherRevenue",
      coalesce(gl.opex,0)::text AS opex, coalesce(gl.da,0)::text AS "dAndA", coalesce(bk.loan,0)::text AS "loanRepayments"
    FROM g LEFT JOIN x USING (month) LEFT JOIN sa USING (month) LEFT JOIN gl USING (month) LEFT JOIN bk USING (month) ORDER BY 1`, [fromMonth, end, endMonth]);
  const keys = ['gpv', 'successes', 'activeMerchants', 'mdr', 'wholesale', 'processing', 'saas', 'otherRevenue', 'opex', 'dAndA', 'loanRepayments'] as const;
  const avg = Object.fromEntries(keys.map((k) => [k, months.reduce((a, m) => a.plus(dec(m[k])), ZERO).div(Math.max(1, months.length)).toDecimalPlaces(4).toString()])) as BreakEvenBaseData['avg'];
  return { months, avg };
}

// ---------------------------------------------------------------------------
// Pricing agreement management (effective-dated; history is never repriced)
// ---------------------------------------------------------------------------
export interface NewAgreementInput {
  merchantId: string; paymentMethodId: string | null; cardRegion: 'domestic' | 'international' | 'any';
  mdrBps: string; fixedFee: string; monthlySaasFee: string; effectiveFrom: string; contractRef: string; constraintAck: boolean; note?: string | null;
}
export class AgreementError extends Error {}

/**
 * Creates an effective-dated pricing agreement. The open agreement for the same
 * merchant / method / region is closed at effective_from − 1 day (contract dimension,
 * not financial evidence). Transactions already priced keep their stored
 * pricing_agreement_id and fees — they are never repriced. Returns the new id and closed ids.
 */
export async function createPricingAgreement(tx: Tx, ctx: { tenantId: string; userId: string; today: string }, i: NewAgreementInput): Promise<{ id: string; closed: { id: string; contract_ref: string | null; old_effective_to: string | null; new_effective_to: string }[] }> {
  const m = await one<any>(tx, 'SELECT id, code, name, price_locked_until, contract_notes, status FROM merchants WHERE id = $1 FOR UPDATE', [i.merchantId]);
  if (!m) throw new AgreementError('Merchant not found');
  if (m.status === 'churned') throw new AgreementError('Merchant is churned — reactivate it before adding pricing.');
  const constrained = (m.price_locked_until && m.price_locked_until > ctx.today) || (m.contract_notes && String(m.contract_notes).trim());
  if (constrained && !i.constraintAck) throw new AgreementError(`This merchant is contractually constrained (${[m.price_locked_until ? `price locked until ${m.price_locked_until}` : null, m.contract_notes].filter(Boolean).join(' · ')}). Confirm that the change complies with the contract.`);
  if (m.price_locked_until && i.effectiveFrom <= m.price_locked_until && !i.constraintAck) throw new AgreementError(`Effective date falls inside the price lock (until ${m.price_locked_until}).`);
  if (dec(i.monthlySaasFee).gt(0) && (i.paymentMethodId !== null || i.cardRegion !== 'any')) throw new AgreementError('A monthly SaaS fee can only be set on an "all methods / any region" agreement (that is where SaaS revenue is recognised).');
  const last = await one<{ d: string | null }>(tx, 'SELECT max(accounting_date)::text AS d FROM transactions WHERE merchant_id = $1', [i.merchantId]);
  if (last?.d && i.effectiveFrom <= last.d) throw new AgreementError(`Transactions up to ${last.d} are already priced. The effective date must be after ${last.d}: historical transactions keep their original pricing and are never repriced.`);
  if (i.paymentMethodId) { const pm = await one(tx, 'SELECT id FROM payment_methods WHERE id = $1', [i.paymentMethodId]); if (!pm) throw new AgreementError('Unknown payment method'); }
  const same = await q<any>(tx, `SELECT id, contract_ref, effective_from::text, effective_to::text FROM pricing_agreements
    WHERE merchant_id = $1 AND payment_method_id IS NOT DISTINCT FROM $2::uuid AND card_region = $3 AND (effective_to IS NULL OR effective_to >= $4::date) FOR UPDATE`, [i.merchantId, i.paymentMethodId, i.cardRegion, i.effectiveFrom]);
  const future = same.find((a) => a.effective_from >= i.effectiveFrom);
  if (future) throw new AgreementError(`Agreement ${future.contract_ref ?? future.id} already starts on ${future.effective_from} for this method/region. Effective dates cannot overlap.`);
  const closeTo = addDays(i.effectiveFrom, -1);
  const closed: { id: string; contract_ref: string | null; old_effective_to: string | null; new_effective_to: string }[] = [];
  for (const a of same) {
    await tx.query('UPDATE pricing_agreements SET effective_to = $2 WHERE id = $1', [a.id, closeTo]);
    closed.push({ id: a.id, contract_ref: a.contract_ref, old_effective_to: a.effective_to, new_effective_to: closeTo });
  }
  const ins = await one<{ id: string }>(tx, `INSERT INTO pricing_agreements (tenant_id, merchant_id, payment_method_id, card_region, mdr_bps, fixed_fee, fee_currency, monthly_saas_fee, effective_from, effective_to, contract_ref, approved_by)
    VALUES ($1,$2,$3,$4,$5,$6,(SELECT base_currency FROM tenants WHERE id = $1),$7,$8,NULL,$9,$10) RETURNING id`,
    [ctx.tenantId, i.merchantId, i.paymentMethodId, i.cardRegion, i.mdrBps, i.fixedFee, i.monthlySaasFee, i.effectiveFrom, i.contractRef, ctx.userId]);
  return { id: ins!.id, closed };
}
