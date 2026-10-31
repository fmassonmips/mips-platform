/**
 * Merchant profitability engine (data layer). Transaction-level economics are
 * aggregated in Postgres; allocation and derived ratios use the decimal engine.
 */
import type { Tx } from '../db';
import { q, one } from '../db';
import { dec, safeDiv, ZERO, type Dec } from '../money';
import { allocate, type AllocationMethod } from '../engine/economics';
import { SAAS_CTE, tenantInfo, policyOf } from './facts';
import { addMonths, monthEnd } from '../dates';

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
  const out: EconRow[] = base.map(({ r, saas, net, contribution }) => {
    const gpv = dec(r.gpv), succ = dec(r.successes), oh = dec((alloc as any)[r.key] ?? 0);
    const bps = (x: Dec) => { const v = safeDiv(x, gpv); return v ? v.times(10000) : null; };
    return {
      key: r.key, name: r.name, gpv: r.gpv, attempts: r.attempts, successes: r.successes, mdr: r.mdr, wholesale: r.wholesale, processing: r.processing, saas: saas.toString(),
      netRevenue: net.toString(), contribution: contribution.toString(), contributionPct: s(safeDiv(contribution, net)), overhead: oh.toString(), netProfit: contribution.minus(oh).toString(),
      effectiveMdrBps: s(bps(dec(r.mdr))), takeRateBps: s(bps(dec(r.mdr).minus(r.wholesale))), wholesaleBps: s(bps(dec(r.wholesale))), avgTicket: s(safeDiv(gpv, succ)),
      revenuePerTxn: s(safeDiv(net, succ)), costPerTxn: s(safeDiv(dec(r.wholesale).plus(r.processing), succ)), successRate: s(safeDiv(succ, r.attempts)), revenueShare: s(safeDiv(net, totalNet)),
    };
  }).sort((a, b) => dec(b.contribution).cmp(dec(a.contribution)));
  const tot = (k: keyof EconRow) => out.reduce((a, r) => a.plus(dec(r[k] as string)), ZERO);
  const T = { gpv: tot('gpv'), mdr: tot('mdr'), wh: tot('wholesale'), proc: tot('processing'), saas: tot('saas'), succ: tot('successes'), att: tot('attempts'), net: tot('netRevenue'), cm: tot('contribution'), oh: tot('overhead') };
  const tb = (x: Dec) => { const v = safeDiv(x, T.gpv); return v ? v.times(10000) : null; };
  const totals: EconRow = { key: 'total', name: 'Total', gpv: T.gpv.toString(), attempts: T.att.toString(), successes: T.succ.toString(), mdr: T.mdr.toString(), wholesale: T.wh.toString(), processing: T.proc.toString(), saas: T.saas.toString(), netRevenue: T.net.toString(), contribution: T.cm.toString(), contributionPct: s(safeDiv(T.cm, T.net)), overhead: T.oh.toString(), netProfit: T.cm.minus(T.oh).toString(), effectiveMdrBps: s(tb(T.mdr)), takeRateBps: s(tb(T.mdr.minus(T.wh))), wholesaleBps: s(tb(T.wh)), avgTicket: s(safeDiv(T.gpv, T.succ)), revenuePerTxn: s(safeDiv(T.net, T.succ)), costPerTxn: s(safeDiv(T.wh.plus(T.proc), T.succ)), successRate: s(safeDiv(T.succ, T.att)), revenueShare: T.net.isZero() ? null : '1' };
  return { rows: out, totals, overheadPool: pool.toString(), allocation, policy: policyOf(t) };
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

export async function merchantTransactions(tx: Tx, merchantId: string, start: string, end: string, opts: { limit?: number; offset?: number; region?: string; acquirer?: string; status?: string } = {}) {
  const params: unknown[] = [merchantId, start, end]; const f: string[] = [];
  if (opts.region) { params.push(opts.region); f.push(`t.card_region = $${params.length}`); }
  if (opts.acquirer) { params.push(opts.acquirer); f.push(`a.code = $${params.length}`); }
  if (opts.status) { params.push(opts.status); f.push(`t.status = $${params.length}`); }
  params.push(opts.limit ?? 200, opts.offset ?? 0);
  return q<any>(tx, `SELECT t.id, t.external_ref, t.event_at, t.accounting_date, t.settlement_date, t.status, t.card_scheme, t.card_region, pm.name AS method, a.code AS acquirer, p.code AS product,
      t.txn_currency, t.amount::text, t.fx_rate_to_base::text, t.amount_base::text, t.mdr_fee_base::text, t.wholesale_fee_base::text, t.processing_cost_base::text,
      (t.mdr_fee_base - t.wholesale_fee_base - t.processing_cost_base)::text AS contribution,
      pa.contract_ref AS pricing_ref, pa.mdr_bps::text AS mdr_bps, fs.schedule_ref AS fee_ref, fs.wholesale_bps::text AS wholesale_bps, ib.filename AS source_file, t.import_batch_id
    FROM transactions t JOIN payment_methods pm ON pm.id = t.payment_method_id LEFT JOIN acquirers a ON a.id = t.acquirer_id JOIN products p ON p.id = t.product_id
    LEFT JOIN pricing_agreements pa ON pa.id = t.pricing_agreement_id LEFT JOIN fee_schedules fs ON fs.id = t.fee_schedule_id LEFT JOIN import_batches ib ON ib.id = t.import_batch_id
    WHERE t.merchant_id = $1 AND t.accounting_date BETWEEN $2 AND $3 ${f.length ? 'AND ' + f.join(' AND ') : ''}
    ORDER BY t.event_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
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
