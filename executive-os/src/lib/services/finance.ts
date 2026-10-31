/**
 * Finance service: P&L from account mappings, budget engine, revenue and cost
 * intelligence. Database aggregation is done in Postgres NUMERIC (returned as
 * decimal strings); all derived arithmetic uses the decimal engine (@/lib/money).
 *
 * The pure functions at the top of this file (plStatement, variance, isMaterial,
 * detectAnomalies, operatingLeverage, growthRates, fullYearForecast, bucketOf…)
 * carry no I/O and are unit tested in tests/unit/finance.test.ts.
 */
import type { Tx } from '../db';
import { q, one } from '../db';
import { audit } from '../audit';
import { dec, safeDiv, pctChange, sum, ZERO, type Dec, type DecLike } from '../money';
import { addMonths, fiscalYearOf, fiscalYearStart, monthsInRange, monthStart, monthEnd } from '../dates';
import { economics, type RevenuePolicy } from '../engine/economics';
import type { MerchantPeriod } from '../engine/bridge';
import { SAAS_CTE, tenantInfo, policyOf } from './facts';

// =====================================================================
// P&L structure (pure)
// =====================================================================
export const PL_BASE = ['revenue', 'cost_of_sales', 'opex', 'd_and_a', 'finance_income', 'finance_costs', 'tax'] as const;
export type PlBaseLine = (typeof PL_BASE)[number];
export type PlSubtotal = 'gross_profit' | 'ebitda' | 'operating_profit' | 'pbt' | 'net_profit';
export type PlKey = PlBaseLine | PlSubtotal;
export const INCOME_LINES: ReadonlySet<string> = new Set(['revenue', 'finance_income']);
/** Higher-is-better lines: income lines and every subtotal. */
export function higherIsBetter(k: PlKey): boolean { return INCOME_LINES.has(k) || !(PL_BASE as readonly string[]).includes(k); }

export interface PlLayoutRow { key: PlKey; label: string; kind: 'base' | 'subtotal'; kpi?: string }
export const PL_LAYOUT: PlLayoutRow[] = [
  { key: 'revenue', label: 'Revenue', kind: 'base', kpi: 'FIN.REVENUE' },
  { key: 'cost_of_sales', label: 'Cost of sales', kind: 'base' },
  { key: 'gross_profit', label: 'Gross profit', kind: 'subtotal', kpi: 'FIN.GROSS_PROFIT' },
  { key: 'opex', label: 'Operating expenses', kind: 'base' },
  { key: 'ebitda', label: 'EBITDA', kind: 'subtotal', kpi: 'FIN.EBITDA' },
  { key: 'd_and_a', label: 'Depreciation & amortisation', kind: 'base' },
  { key: 'operating_profit', label: 'Operating profit', kind: 'subtotal', kpi: 'FIN.OPERATING_PROFIT' },
  { key: 'finance_income', label: 'Finance income', kind: 'base' },
  { key: 'finance_costs', label: 'Finance costs', kind: 'base' },
  { key: 'pbt', label: 'Profit before tax', kind: 'subtotal', kpi: 'FIN.PBT' },
  { key: 'tax', label: 'Income tax', kind: 'base' },
  { key: 'net_profit', label: 'Net profit', kind: 'subtotal', kpi: 'FIN.NET_PROFIT' },
];
export const PL_LABEL: Record<string, string> = Object.fromEntries(PL_LAYOUT.map((r) => [r.key, r.label]));

export type PlFull = Record<PlKey, Dec | null>;

/** Null-propagating addition with signs: any null component → null. */
function comb(parts: [Dec | null, 1 | -1][]): Dec | null {
  let acc = ZERO;
  for (const [v, s] of parts) { if (v === null) return null; acc = s === 1 ? acc.plus(v) : acc.minus(v); }
  return acc;
}

/**
 * Builds the full statement from base lines expressed in their NATURAL sign
 * (income lines = credit − debit, expense lines = debit − credit).
 * A missing (null/undefined) base line makes every dependent subtotal null —
 * e.g. a budget with no D&A lines has no budgeted operating profit.
 */
export function plStatement(b: Partial<Record<PlBaseLine, DecLike | null>>): PlFull {
  const g = (k: PlBaseLine) => (b[k] === null || b[k] === undefined ? null : dec(b[k] as DecLike));
  const revenue = g('revenue'), cos = g('cost_of_sales'), opex = g('opex'), da = g('d_and_a'), fi = g('finance_income'), fc = g('finance_costs'), tax = g('tax');
  const gross_profit = comb([[revenue, 1], [cos, -1]]);
  const ebitda = comb([[gross_profit, 1], [opex, -1]]);
  const operating_profit = comb([[ebitda, 1], [da, -1]]);
  const pbt = comb([[operating_profit, 1], [fi, 1], [fc, -1]]);
  const net_profit = comb([[pbt, 1], [tax, -1]]);
  return { revenue, cost_of_sales: cos, gross_profit, opex, ebitda, d_and_a: da, operating_profit, finance_income: fi, finance_costs: fc, pbt, tax, net_profit };
}

export function plMargins(p: PlFull) {
  const r = p.revenue;
  const m = (x: Dec | null) => (x === null || r === null ? null : safeDiv(x, r));
  return { gross: m(p.gross_profit), ebitda: m(p.ebitda), operating: m(p.operating_profit), net: m(p.net_profit) };
}

export interface Variance { abs: Dec | null; pct: Dec | null; favourable: boolean | null }
/** actual − plan; pct relative to |plan|; favourable depends on line direction. */
export function variance(actual: DecLike | null, plan: DecLike | null, higherBetter: boolean): Variance {
  if (actual === null || plan === null || actual === undefined || plan === undefined) return { abs: null, pct: null, favourable: null };
  const a = dec(actual), p = dec(plan);
  const abs = a.minus(p);
  const pct = safeDiv(abs, p.abs());
  return { abs, pct, favourable: abs.isZero() ? null : higherBetter ? abs.gt(0) : abs.lt(0) };
}

/** Material when |actual − plan| / |plan| ≥ materiality %, or any non-zero deviation from a zero plan. */
export function isMaterial(actual: DecLike | null, plan: DecLike | null, materialityPct: DecLike): boolean {
  if (actual === null || plan === null || actual === undefined || plan === undefined) return false;
  const a = dec(actual), p = dec(plan);
  const d = a.minus(p).abs();
  if (p.isZero()) return !d.isZero();
  return d.div(p.abs()).gte(dec(materialityPct).div(100));
}

export interface AnomalyPoint { period: string; value: Dec; mean: Dec | null; std: Dec | null; z: Dec | null; n: number; anomaly: boolean; direction: 'above' | 'below' | null; reason: string | null }
/**
 * Flags points deviating more than `threshold` standard deviations from the mean
 * of the trailing `window` observations (sample std, n−1). Requires `minHistory`
 * prior points. A perfectly flat history (σ = 0) flags any deviation larger than
 * `flatTolerancePct` % of the mean. `minDeviationPct` (default 0) additionally requires
 * |value − mean| ≥ that % of the mean, so tiny but low-variance wobbles are ignored.
 */
export function detectAnomalies(series: { period: string; value: DecLike }[], opts: { window?: number; threshold?: DecLike; minHistory?: number; flatTolerancePct?: DecLike; minDeviationPct?: DecLike } = {}): AnomalyPoint[] {
  const window = opts.window ?? 6, thr = dec(opts.threshold ?? 2), minH = opts.minHistory ?? 4, flat = dec(opts.flatTolerancePct ?? 5), minDev = dec(opts.minDeviationPct ?? 0);
  const vals = series.map((s) => ({ period: s.period, v: dec(s.value) }));
  return vals.map((p, i) => {
    const hist = vals.slice(Math.max(0, i - window), i).map((x) => x.v);
    if (hist.length < minH) return { period: p.period, value: p.v, mean: null, std: null, z: null, n: hist.length, anomaly: false, direction: null, reason: null };
    const mean = sum(hist).div(hist.length);
    const variance_ = sum(hist.map((h) => h.minus(mean).pow(2))).div(hist.length - 1);
    const std = variance_.sqrt();
    const dev = p.v.minus(mean);
    const direction = dev.isZero() ? null : dev.gt(0) ? 'above' : 'below';
    if (std.isZero()) {
      const rel = safeDiv(dev.abs(), mean.abs());
      const anomaly = rel === null ? !dev.isZero() : rel.times(100).gt(flat);
      return { period: p.period, value: p.v, mean, std, z: null, n: hist.length, anomaly, direction, reason: anomaly ? `Deviates from a flat ${hist.length}-month history` : null };
    }
    const z = dev.div(std);
    // optional materiality floor: a statistically unusual but immaterial wobble is not reported
    const rel = safeDiv(dev.abs(), mean.abs());
    const anomaly = z.abs().gt(thr) && (minDev.isZero() || rel === null || rel.times(100).gte(minDev));
    return { period: p.period, value: p.v, mean, std, z, n: hist.length, anomaly, direction, reason: anomaly ? `${z.abs().toDecimalPlaces(1).toFixed(1)}σ ${direction} the trailing ${hist.length}-month mean` : null };
  });
}

/** Degree of operating leverage = %Δ operating profit / %Δ revenue (null-safe). */
export function operatingLeverage(revCur: DecLike | null, revPrev: DecLike | null, opCur: DecLike | null, opPrev: DecLike | null): { value: Dec | null; revenueChange: Dec | null; opChange: Dec | null; note: string | null } {
  if ([revCur, revPrev, opCur, opPrev].some((x) => x === null || x === undefined)) return { value: null, revenueChange: null, opChange: null, note: 'Missing comparison data' };
  const rc = pctChange(revCur as DecLike, revPrev as DecLike);
  const oc = pctChange(opCur as DecLike, opPrev as DecLike);
  if (rc === null) return { value: null, revenueChange: null, opChange: oc, note: 'Comparison revenue is zero' };
  if (oc === null) return { value: null, revenueChange: rc, opChange: null, note: 'Comparison operating profit is zero' };
  if (rc.isZero()) return { value: null, revenueChange: rc, opChange: oc, note: 'Revenue unchanged — leverage undefined' };
  return { value: oc.div(rc), revenueChange: rc, opChange: oc, note: null };
}

/** MoM / QoQ (3 months vs preceding 3) / YoY growth at `month`. Missing months → null. */
export function growthRates(series: Map<string, DecLike>, month: string) {
  const get = (m: string) => (series.has(m) ? dec(series.get(m)!) : null);
  const s3 = (endM: string) => { const ms = [0, 1, 2].map((i) => addMonths(endM, -i)); const v = ms.map(get); return v.some((x) => x === null) ? null : sum(v as Dec[]); };
  const cur = get(month), prev = get(addMonths(month, -1)), ly = get(addMonths(month, -12));
  const q = s3(month), pq = s3(addMonths(month, -3));
  const pc = (a: Dec | null, b: Dec | null) => (a === null || b === null ? null : pctChange(a, b));
  return { mom: pc(cur, prev), qoq: pc(q, pq), yoy: pc(cur, ly), current: cur, previous: prev, lastYear: ly, quarter: q, prevQuarter: pq };
}

/** Full-year forecast = Σ actual for months ≤ lastActual + Σ plan for later months of the fiscal year. */
export function fullYearForecast(fyMonths: string[], actual: Map<string, DecLike>, plan: Map<string, DecLike>, lastActualMonth: string): Dec {
  let acc = ZERO;
  for (const m of fyMonths) acc = acc.plus(m <= lastActualMonth ? dec(actual.get(m) ?? 0) : dec(plan.get(m) ?? 0));
  return acc;
}

export function fiscalQuarterOf(month: string, fyStart: number): string {
  const fy = fiscalYearOf(month, fyStart);
  const idx = (Number(month.slice(5, 7)) - fyStart + 12) % 12;
  return `FY${fy} Q${Math.floor(idx / 3) + 1}`;
}
export type PlView = 'monthly' | 'quarterly' | 'annual';
export function bucketOf(month: string, view: PlView, fyStart: number): string {
  if (view === 'monthly') return month.slice(0, 7);
  if (view === 'quarterly') return fiscalQuarterOf(month, fyStart);
  return `FY${fiscalYearOf(month, fyStart)}`;
}
export function fiscalYearMonths(fy: number, fyStart: number): string[] { const s = fiscalYearStart(fy, fyStart); return monthsInRange(s, monthEnd(addMonths(s, 11))); }

/** Shift an ISO date by whole years (Feb 29 → Feb 28). */
export function shiftYears(d: string, n: number): string {
  const s = `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
  return s.endsWith('-02-29') ? s.replace('-02-29', '-02-28') : s;
}

/** Map a raw DB error to a message fit for the user (segregation of duties, locks, uniqueness). */
export function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string; table?: string; constraint?: string };
  if (err?.code === '23514' && (err.table === 'budget_versions' || /budget_versions/.test(err.message ?? '')))
    return 'Segregation of duties: the approver must be a different person from the submitter (enforced by a database CHECK constraint).';
  if (err?.code === '23505') return 'A record with the same unique key already exists (version names must be unique).';
  if (err?.code === 'P0001' && /VERSION_LOCKED/.test(err.message ?? '')) return 'This version is approved and locked by the database; create a revision instead.';
  if (err?.code === 'P0001') return (err.message ?? 'Rejected by a database rule').replace(/^[A-Z_]+:\s*/, '');
  if (err?.code === '22P02' || err?.code === '22003') return 'Invalid numeric value.';
  return err?.message ? `Database error: ${err.message}` : 'Unexpected error';
}

// =====================================================================
// GL data access
// =====================================================================
export interface PlAccount { id: string; code: string; name: string; account_type: string; pl_line: PlBaseLine; cost_category: string | null; cost_behaviour: string | null; revenue_stream: string | null }
export async function plAccounts(tx: Tx): Promise<PlAccount[]> {
  return q<PlAccount>(tx, `SELECT id, code, name, account_type, pl_line, cost_category, cost_behaviour, revenue_stream FROM chart_of_accounts WHERE pl_line IS NOT NULL ORDER BY code`);
}

export interface GlFilter { departmentId?: string | null; productId?: string | null }
function glFilterSql(f: GlFilter, params: unknown[], alias = 'e'): string {
  let s = '';
  if (f.departmentId) { params.push(f.departmentId); s += ` AND ${alias}.department_id = $${params.length}`; }
  if (f.productId) { params.push(f.productId); s += ` AND ${alias}.product_id = $${params.length}`; }
  return s;
}
const NATURAL = `CASE WHEN a.pl_line IN ('revenue','finance_income') THEN e.credit_base - e.debit_base ELSE e.debit_base - e.credit_base END`;

export interface AccountMonth { account_id: string; code: string; name: string; pl_line: PlBaseLine; cost_category: string | null; cost_behaviour: string | null; revenue_stream: string | null; period: string; amount: string; entries: string }
/** P&L accounts × month, natural sign. */
export async function glAccountMonthly(tx: Tx, start: string, end: string, f: GlFilter = {}): Promise<AccountMonth[]> {
  const params: unknown[] = [start, end];
  const filt = glFilterSql(f, params);
  return q<AccountMonth>(tx, `SELECT a.id AS account_id, a.code, a.name, a.pl_line, a.cost_category, a.cost_behaviour, a.revenue_stream, e.period::text AS period,
      sum(${NATURAL})::text AS amount, count(*)::text AS entries
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id
    WHERE a.pl_line IS NOT NULL AND e.entry_date BETWEEN $1 AND $2${filt}
    GROUP BY a.id, a.code, a.name, a.pl_line, a.cost_category, a.cost_behaviour, a.revenue_stream, e.period ORDER BY a.code, e.period`, params);
}

/** Independent reconciliation: Σ (credit − debit) over every P&L-mapped account, straight from gl_entries. */
export async function glPlReconciliation(tx: Tx, start: string, end: string, f: GlFilter = {}) {
  const params: unknown[] = [start, end];
  const filt = glFilterSql(f, params);
  const r = await one<{ net: string; n: string; unmapped: string; unmapped_n: string; dr: string; cr: string }>(tx, `SELECT
      coalesce(sum(e.credit_base - e.debit_base) FILTER (WHERE a.pl_line IS NOT NULL),0)::text AS net,
      count(*) FILTER (WHERE a.pl_line IS NOT NULL)::text AS n,
      coalesce(sum(e.credit_base - e.debit_base) FILTER (WHERE a.pl_line IS NULL AND a.account_type IN ('revenue','expense')),0)::text AS unmapped,
      count(*) FILTER (WHERE a.pl_line IS NULL AND a.account_type IN ('revenue','expense'))::text AS unmapped_n,
      coalesce(sum(e.debit_base),0)::text AS dr, coalesce(sum(e.credit_base),0)::text AS cr
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2${filt}`, params);
  return { glNet: r!.net, entries: r!.n, unmappedNet: r!.unmapped, unmappedEntries: r!.unmapped_n, debits: r!.dr, credits: r!.cr };
}

/** Sum account-month rows into base P&L lines (lines with no rows → 0). */
export function sumBase(rows: { pl_line: string; amount: DecLike }[]): Record<PlBaseLine, Dec> {
  const out = Object.fromEntries(PL_BASE.map((k) => [k, ZERO])) as Record<PlBaseLine, Dec>;
  for (const r of rows) if ((PL_BASE as readonly string[]).includes(r.pl_line)) out[r.pl_line as PlBaseLine] = out[r.pl_line as PlBaseLine].plus(dec(r.amount));
  return out;
}
/** Same but lines with no rows → null (used for budgets: "not budgeted" ≠ 0). */
export function sumBasePresent(rows: { pl_line: string; amount: DecLike }[]): Record<PlBaseLine, Dec | null> {
  const out = Object.fromEntries(PL_BASE.map((k) => [k, null])) as Record<PlBaseLine, Dec | null>;
  for (const r of rows) { const k = r.pl_line as PlBaseLine; if ((PL_BASE as readonly string[]).includes(k)) out[k] = (out[k] ?? ZERO).plus(dec(r.amount)); }
  return out;
}

export interface GlEntryRow { id: string; journal_ref: string; line_no: number; entry_date: string; period: string; account_code: string; account_name: string; pl_line: string | null; description: string | null; currency: string; debit: string; credit: string; debit_base: string; credit_base: string; natural: string; source_system: string; import_batch_id: string | null; batch_filename: string | null; is_adjustment: boolean; adjustment_ref: string | null; department: string | null; product: string | null; merchant_id: string | null; merchant: string | null }
export async function glEntries(tx: Tx, start: string, end: string, sel: { accountCode?: string; plLine?: string; costCategory?: string }, f: GlFilter = {}, limit = 2000): Promise<GlEntryRow[]> {
  const params: unknown[] = [start, end];
  let w = '';
  if (sel.accountCode) { params.push(sel.accountCode); w += ` AND a.code = $${params.length}`; }
  if (sel.plLine) { params.push(sel.plLine); w += ` AND a.pl_line = $${params.length}`; }
  if (sel.costCategory) { params.push(sel.costCategory); w += ` AND a.cost_category = $${params.length}`; }
  if (!sel.accountCode && !sel.plLine && !sel.costCategory) w += ' AND a.pl_line IS NOT NULL';
  w += glFilterSql(f, params);
  params.push(limit);
  return q<GlEntryRow>(tx, `SELECT e.id, e.journal_ref, e.line_no, e.entry_date::text, e.period::text, a.code AS account_code, a.name AS account_name, a.pl_line, e.description, e.currency,
      e.debit::text, e.credit::text, e.debit_base::text, e.credit_base::text, (${NATURAL})::text AS natural, e.source_system, e.import_batch_id, b.filename AS batch_filename,
      e.is_adjustment, adj.reference AS adjustment_ref, d.name AS department, p.code AS product, e.merchant_id, m.name AS merchant
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id
    LEFT JOIN import_batches b ON b.id = e.import_batch_id LEFT JOIN adjustments adj ON adj.id = e.adjustment_id
    LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN products p ON p.id = e.product_id LEFT JOIN merchants m ON m.id = e.merchant_id
    WHERE e.entry_date BETWEEN $1 AND $2${w} ORDER BY e.entry_date, e.journal_ref, e.line_no LIMIT $${params.length}`, params);
}

export async function departments(tx: Tx) { return q<{ id: string; code: string; name: string }>(tx, 'SELECT id, code, name FROM departments ORDER BY name'); }
export async function productsList(tx: Tx) { return q<{ id: string; code: string; name: string; channel: string; is_transactional: boolean }>(tx, 'SELECT id, code, name, channel, is_transactional FROM products ORDER BY code'); }

// =====================================================================
// Budgets
// =====================================================================
export interface BudgetVersion { id: string; name: string; fiscal_year: number; kind: 'budget' | 'forecast'; status: 'draft' | 'submitted' | 'approved' | 'superseded'; parent_version_id: string | null; parent_name: string | null; revision: number; notes: string | null; created_by_name: string | null; submitted_by: string | null; submitted_by_name: string | null; approved_by: string | null; approved_by_name: string | null; approved_at: string | null; created_at: string; created_by: string | null; lines: string; total_revenue: string | null; total_cost: string | null; dim_lines: string; comments: string }
export async function budgetVersions(tx: Tx, id?: string): Promise<BudgetVersion[]> {
  return q<BudgetVersion>(tx, `SELECT v.id, v.name, v.fiscal_year, v.kind, v.status, v.parent_version_id, pv.name AS parent_name, v.revision, v.notes,
      cu.name AS created_by_name, v.created_by, v.submitted_by, su.name AS submitted_by_name, v.approved_by, au.name AS approved_by_name, v.approved_at::text, v.created_at::text,
      (SELECT count(*) FROM budget_lines bl WHERE bl.version_id = v.id)::text AS lines,
      (SELECT sum(bl.amount_base) FROM budget_lines bl JOIN chart_of_accounts a ON a.id = bl.account_id WHERE bl.version_id = v.id AND a.pl_line = 'revenue')::text AS total_revenue,
      (SELECT sum(bl.amount_base) FROM budget_lines bl JOIN chart_of_accounts a ON a.id = bl.account_id WHERE bl.version_id = v.id AND a.pl_line IN ('cost_of_sales','opex','d_and_a','finance_costs'))::text AS total_cost,
      (SELECT count(*) FROM budget_lines bl WHERE bl.version_id = v.id AND (bl.department_id IS NOT NULL OR bl.product_id IS NOT NULL))::text AS dim_lines,
      (SELECT count(*) FROM variance_commentary c WHERE c.version_id = v.id)::text AS comments
    FROM budget_versions v LEFT JOIN budget_versions pv ON pv.id = v.parent_version_id
    LEFT JOIN users cu ON cu.id = v.created_by LEFT JOIN users su ON su.id = v.submitted_by LEFT JOIN users au ON au.id = v.approved_by
    ${id ? 'WHERE v.id = $1' : ''} ORDER BY v.fiscal_year DESC, v.kind, v.revision DESC, v.created_at DESC`, id ? [id] : []);
}

export interface BudgetLineRow { line_id: string; version_id: string; account_id: string; code: string; name: string; pl_line: PlBaseLine; cost_category: string | null; period: string; amount: string; department_id: string | null; department: string | null; product_id: string | null; product: string | null }
export async function budgetLines(tx: Tx, versionId: string): Promise<BudgetLineRow[]> {
  return q<BudgetLineRow>(tx, `SELECT bl.id AS line_id, bl.version_id, a.id AS account_id, a.code, a.name, a.pl_line, a.cost_category, bl.period::text, bl.amount_base::text AS amount,
      bl.department_id, d.name AS department, bl.product_id, p.code AS product
    FROM budget_lines bl JOIN chart_of_accounts a ON a.id = bl.account_id LEFT JOIN departments d ON d.id = bl.department_id LEFT JOIN products p ON p.id = bl.product_id
    WHERE bl.version_id = $1 ORDER BY a.code, bl.period`, [versionId]);
}

/**
 * Approved BUDGET per account × month for a date range: for each month, the
 * version with status 'approved', kind 'budget' and fiscal_year = FY of the month.
 * Optional dimension filters apply to budget lines (most demo lines carry none).
 */
export async function approvedBudgetMonthly(tx: Tx, start: string, end: string, fyStart: number, f: GlFilter = {}, kind: 'budget' | 'forecast' = 'budget') {
  const params: unknown[] = [monthStart(start), end, fyStart, kind];
  let filt = '';
  if (f.departmentId) { params.push(f.departmentId); filt += ` AND bl.department_id = $${params.length}`; }
  if (f.productId) { params.push(f.productId); filt += ` AND bl.product_id = $${params.length}`; }
  const rows = await q<{ account_id: string; code: string; name: string; pl_line: PlBaseLine; cost_category: string | null; cost_behaviour: string | null; period: string; amount: string; version_id: string; version_name: string }>(tx, `SELECT a.id AS account_id, a.code, a.name, a.pl_line, a.cost_category, a.cost_behaviour, bl.period::text, sum(bl.amount_base)::text AS amount, v.id AS version_id, v.name AS version_name
    FROM budget_lines bl JOIN budget_versions v ON v.id = bl.version_id JOIN chart_of_accounts a ON a.id = bl.account_id
    WHERE v.status = 'approved' AND v.kind = $4 AND bl.period BETWEEN $1 AND $2
      AND v.fiscal_year = CASE WHEN $3::int = 1 THEN extract(year FROM bl.period)::int WHEN extract(month FROM bl.period)::int >= $3::int THEN extract(year FROM bl.period)::int + 1 ELSE extract(year FROM bl.period)::int END
      ${filt}
    GROUP BY a.id, a.code, a.name, a.pl_line, a.cost_category, a.cost_behaviour, bl.period, v.id, v.name ORDER BY a.code, bl.period`, params);
  const versions = Array.from(new Map(rows.map((r) => [r.version_id, r.version_name])).entries()).map(([id, name]) => ({ id, name }));
  return { rows, versions };
}

export interface Commentary { id: string; version_id: string; version_name: string; period: string; line_key: string; comment: string; author: string | null; created_at: string }
export async function varianceCommentary(tx: Tx, opts: { versionIds?: string[]; start?: string; end?: string } = {}): Promise<Commentary[]> {
  const params: unknown[] = []; const w: string[] = [];
  if (opts.versionIds) { params.push(opts.versionIds); w.push(`c.version_id = ANY($${params.length}::uuid[])`); }
  if (opts.start) { params.push(monthStart(opts.start)); w.push(`c.period >= $${params.length}`); }
  if (opts.end) { params.push(opts.end); w.push(`c.period <= $${params.length}`); }
  return q<Commentary>(tx, `SELECT c.id, c.version_id, v.name AS version_name, c.period::text, c.line_key, c.comment, u.name AS author, c.created_at::text
    FROM variance_commentary c JOIN budget_versions v ON v.id = c.version_id LEFT JOIN users u ON u.id = c.author_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.period DESC, c.created_at DESC`, params);
}
/** A commentary covers a variance when it has the same version & month and one of the candidate keys. */
export function covered(comments: Pick<Commentary, 'version_id' | 'period' | 'line_key'>[], versionId: string, period: string, keys: string[]): boolean {
  return comments.some((c) => c.version_id === versionId && c.period.slice(0, 7) === period.slice(0, 7) && keys.includes(c.line_key));
}

export function materialityPct(settings: Record<string, any> | undefined): Dec {
  const v = settings?.materiality_pct;
  try { const d = dec(v ?? 5); return d.gt(0) ? d : dec(5); } catch { return dec(5); }
}

/** Latest month with GL activity, capped at `asOf` (used as "last actual month"). */
export async function lastActualMonth(tx: Tx, asOf: string): Promise<string | null> {
  const r = await one<{ m: string | null }>(tx, `SELECT max(period)::text AS m FROM gl_entries WHERE period <= $1`, [monthStart(asOf)]);
  return r?.m ?? null;
}

// ---------------- Budget mutations (called from server actions) ----------------
export interface Actor { tenantId: string; userId: string; isDemo: boolean }

export async function createBudgetVersion(tx: Tx, a: Actor, i: { name: string; kind: 'budget' | 'forecast'; fiscalYear: number; copyFrom?: string | null; notes?: string | null; asRevision?: boolean }): Promise<string> {
  let parent: { id: string; revision: number; fiscal_year: number; kind: 'budget' | 'forecast' } | null = null;
  if (i.copyFrom) {
    parent = await one(tx, 'SELECT id, revision, fiscal_year, kind FROM budget_versions WHERE id = $1', [i.copyFrom]);
    if (!parent) throw new Error('Source version not found');
  }
  const rev = i.asRevision && parent ? parent.revision + 1 : 1;
  const fy = i.asRevision && parent ? parent.fiscal_year : i.fiscalYear;
  const kind = i.asRevision && parent ? parent.kind : i.kind;
  const v = await one<{ id: string }>(tx, `INSERT INTO budget_versions (tenant_id, name, fiscal_year, kind, status, parent_version_id, revision, notes, created_by, is_demo)
    VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9) RETURNING id`, [a.tenantId, i.name, fy, kind, i.asRevision && parent ? parent.id : null, rev, i.notes ?? null, a.userId, a.isDemo]);
  let copied = 0;
  if (parent) {
    const r = await tx.query(`INSERT INTO budget_lines (tenant_id, version_id, account_id, department_id, product_id, period, amount_base)
      SELECT tenant_id, $1, account_id, department_id, product_id, period, amount_base FROM budget_lines WHERE version_id = $2`, [v!.id, parent.id]);
    copied = r.rowCount ?? 0;
  }
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: i.asRevision ? 'budget.revision_created' : 'budget.version_created', entityType: 'budget_versions', entityId: v!.id, payload: { name: i.name, kind, fiscal_year: fy, revision: rev, copied_from: parent?.id ?? null, lines_copied: copied } });
  return v!.id;
}

async function lockVersion(tx: Tx, id: string) {
  const v = await one<{ id: string; status: string; fiscal_year: number; kind: string; submitted_by: string | null; name: string }>(tx, 'SELECT id, status, fiscal_year, kind, submitted_by, name FROM budget_versions WHERE id = $1 FOR UPDATE', [id]);
  if (!v) throw new Error('Version not found');
  return v;
}

/** amount null = remove the (company-level) line. */
export interface LineChange { accountId: string; period: string; amount: string | null }
export async function saveBudgetLines(tx: Tx, a: Actor, versionId: string, changes: LineChange[]): Promise<{ updated: number; inserted: number; deleted: number }> {
  const v = await lockVersion(tx, versionId);
  if (v.status !== 'draft') throw new Error(`Only draft versions can be edited (this version is ${v.status}).`);
  let updated = 0, inserted = 0, deleted = 0;
  const log: { accountId: string; period: string; before: string | null; after: string | null }[] = [];
  for (const c of changes) {
    const prev = await one<{ amount: string }>(tx, `SELECT amount_base::text AS amount FROM budget_lines WHERE version_id = $1 AND account_id = $2 AND period = $3 AND department_id IS NULL AND product_id IS NULL`, [versionId, c.accountId, c.period]);
    if (c.amount === null) {
      if (!prev) continue;
      await tx.query(`DELETE FROM budget_lines WHERE version_id = $1 AND account_id = $2 AND period = $3 AND department_id IS NULL AND product_id IS NULL`, [versionId, c.accountId, c.period]);
      deleted++; log.push({ accountId: c.accountId, period: c.period, before: prev.amount, after: null });
      continue;
    }
    if (prev) {
      if (dec(prev.amount).eq(dec(c.amount))) continue;
      await tx.query(`UPDATE budget_lines SET amount_base = $4 WHERE version_id = $1 AND account_id = $2 AND period = $3 AND department_id IS NULL AND product_id IS NULL`, [versionId, c.accountId, c.period, c.amount]);
      updated++; log.push({ accountId: c.accountId, period: c.period, before: prev.amount, after: c.amount });
    } else {
      await tx.query(`INSERT INTO budget_lines (tenant_id, version_id, account_id, period, amount_base) VALUES ($1,$2,$3,$4,$5)`, [a.tenantId, versionId, c.accountId, c.period, c.amount]);
      inserted++; log.push({ accountId: c.accountId, period: c.period, before: null, after: c.amount });
    }
  }
  if (log.length) await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'budget.lines_edited', entityType: 'budget_versions', entityId: versionId, payload: { version: v.name, updated, inserted, deleted, changes: log.slice(0, 500) } });
  return { updated, inserted, deleted };
}

export async function submitBudgetVersion(tx: Tx, a: Actor, id: string) {
  const v = await lockVersion(tx, id);
  if (v.status !== 'draft') throw new Error(`Only a draft can be submitted (status: ${v.status}).`);
  const n = await one<{ n: number }>(tx, 'SELECT count(*)::int AS n FROM budget_lines WHERE version_id = $1', [id]);
  if (!n?.n) throw new Error('Cannot submit a version with no budget lines.');
  await tx.query(`UPDATE budget_versions SET status = 'submitted', submitted_by = $2 WHERE id = $1`, [id, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'budget.submitted', entityType: 'budget_versions', entityId: id, payload: { name: v.name, lines: n.n } });
}

export async function approveBudgetVersion(tx: Tx, a: Actor, id: string): Promise<{ superseded: string[] }> {
  const v = await lockVersion(tx, id);
  if (v.status !== 'submitted') throw new Error(`Only a submitted version can be approved (status: ${v.status}).`);
  // Segregation of duties (approver ≠ submitter) is enforced by the DB CHECK constraint on
  // budget_versions; we deliberately let the database reject it so the rule cannot drift.
  const sup = await q<{ id: string; name: string }>(tx, `UPDATE budget_versions SET status = 'superseded' WHERE fiscal_year = $1 AND kind = $2 AND status = 'approved' AND id <> $3 RETURNING id, name`, [v.fiscal_year, v.kind, id]);
  await tx.query(`UPDATE budget_versions SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [id, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'budget.approved', entityType: 'budget_versions', entityId: id, payload: { name: v.name, superseded: sup } });
  return { superseded: sup.map((s) => s.id) };
}

export async function returnBudgetToDraft(tx: Tx, a: Actor, id: string, reason: string) {
  const v = await lockVersion(tx, id);
  if (v.status !== 'submitted') throw new Error(`Only a submitted version can be returned (status: ${v.status}).`);
  await tx.query(`UPDATE budget_versions SET status = 'draft', submitted_by = NULL WHERE id = $1`, [id]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'budget.returned_to_draft', entityType: 'budget_versions', entityId: id, payload: { name: v.name, reason } });
}

export async function deleteDraftVersion(tx: Tx, a: Actor, id: string) {
  const v = await lockVersion(tx, id);
  if (v.status !== 'draft') throw new Error('Only draft versions can be deleted; approved versions are retained as evidence.');
  const kids = await one<{ n: number }>(tx, 'SELECT count(*)::int AS n FROM budget_versions WHERE parent_version_id = $1', [id]);
  if (kids?.n) throw new Error('This draft has revisions derived from it and cannot be deleted.');
  const n = await one<{ n: number }>(tx, 'SELECT count(*)::int AS n FROM budget_lines WHERE version_id = $1', [id]);
  await tx.query('DELETE FROM budget_versions WHERE id = $1', [id]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'budget.draft_deleted', entityType: 'budget_versions', entityId: id, payload: { name: v.name, lines: n?.n ?? 0 } });
}

export async function addVarianceComment(tx: Tx, a: Actor, i: { versionId: string; period: string; lineKey: string; comment: string }): Promise<string> {
  const v = await one<{ id: string; name: string }>(tx, 'SELECT id, name FROM budget_versions WHERE id = $1', [i.versionId]);
  if (!v) throw new Error('Version not found');
  const r = await one<{ id: string }>(tx, `INSERT INTO variance_commentary (tenant_id, version_id, period, line_key, comment, author_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [a.tenantId, i.versionId, monthStart(i.period), i.lineKey, i.comment, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'budget.variance_commented', entityType: 'variance_commentary', entityId: r!.id, payload: { version: v.name, period: monthStart(i.period), line_key: i.lineKey } });
  return r!.id;
}

// =====================================================================
// Revenue intelligence (transaction engine + GL)
// =====================================================================
export const REVENUE_DIMS = {
  merchant: { label: 'Merchant', key: 'm.id::text', name: 'm.name', merchantLevel: true },
  product: { label: 'Product', key: 'p.code', name: 'p.name', merchantLevel: false },
  channel: { label: 'Payment channel', key: 'p.channel', name: 'initcap(p.channel)', merchantLevel: false },
  acquirer: { label: 'Acquirer', key: "coalesce(a.code,'NONE')", name: "coalesce(a.name,'(no acquirer)')", merchantLevel: false },
  method: { label: 'Payment method', key: 'pm.code', name: 'pm.name', merchantLevel: false },
  currency: { label: 'Transaction currency', key: 't.txn_currency', name: 't.txn_currency', merchantLevel: false },
  country: { label: 'Transaction country', key: 't.country', name: 't.country', merchantLevel: false },
  region: { label: 'Domestic vs international', key: 't.card_region', name: 'initcap(t.card_region)', merchantLevel: false },
  segment: { label: 'Segment', key: 'm.segment', name: "initcap(replace(m.segment,'_',' '))", merchantLevel: true },
  vertical: { label: 'Vertical', key: "coalesce(v.code,'(none)')", name: "coalesce(v.name,'(unclassified)')", merchantLevel: true },
} as const;
export type RevenueDim = keyof typeof REVENUE_DIMS;

export interface RevenueRow { key: string; name: string; gpv: string; attempts: string; successes: string; mdr: string; wholesale: string; processing: string; saas: string; txnRevenue: string; revenue: string; takeRateBps: string | null; activated_at?: string | null; churned_at?: string | null; code?: string | null }

/**
 * Recognised revenue by a dimension, from transactions (MDR − wholesale under
 * agent-net, MDR under principal-gross) plus SaaS fees from pricing agreements.
 * SaaS is attributed only for merchant-level dimensions; otherwise it appears as a
 * separate "not attributable" row so totals always reconcile.
 */
export async function revenueBy(tx: Tx, start: string, end: string, dim: RevenueDim, policy?: RevenuePolicy): Promise<RevenueRow[]> {
  const pol = policy ?? policyOf(await tenantInfo(tx));
  const d = REVENUE_DIMS[dim];
  const rows = await q<any>(tx, `SELECT ${d.key} AS key, min(${d.name}) AS name,
      coalesce(sum(t.amount_base) FILTER (WHERE t.status='success'),0)::text AS gpv, count(*)::text AS attempts, count(*) FILTER (WHERE t.status='success')::text AS successes,
      coalesce(sum(t.mdr_fee_base),0)::text AS mdr, coalesce(sum(t.wholesale_fee_base),0)::text AS wholesale, coalesce(sum(t.processing_cost_base),0)::text AS processing
    FROM transactions t JOIN merchants m ON m.id = t.merchant_id LEFT JOIN verticals v ON v.id = m.vertical_id
    LEFT JOIN acquirers a ON a.id = t.acquirer_id JOIN payment_methods pm ON pm.id = t.payment_method_id JOIN products p ON p.id = t.product_id
    WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1`, [start, end]);
  const saasRows = d.merchantLevel
    ? await q<any>(tx, `WITH ${SAAS_CTE} SELECT ${d.key} AS key, min(${d.name}) AS name, sum(s.fee)::text AS saas FROM saas s JOIN merchants m ON m.id = s.merchant_id LEFT JOIN verticals v ON v.id = m.vertical_id GROUP BY 1`, [start, end])
    : await q<any>(tx, `WITH ${SAAS_CTE} SELECT '__saas' AS key, 'SaaS subscriptions (not attributable)' AS name, sum(fee)::text AS saas FROM saas HAVING sum(fee) IS NOT NULL`, [start, end]);
  const by = new Map<string, any>(rows.map((r) => [r.key, { ...r, saas: '0' }]));
  for (const s of saasRows) {
    const ex = by.get(s.key);
    if (ex) ex.saas = s.saas; else by.set(s.key, { key: s.key, name: s.name, gpv: '0', attempts: '0', successes: '0', mdr: '0', wholesale: '0', processing: '0', saas: s.saas });
  }
  let meta = new Map<string, any>();
  if (dim === 'merchant') meta = new Map((await q<any>(tx, 'SELECT id::text AS id, code, activated_at::text, churned_at::text FROM merchants')).map((m) => [m.id, m]));
  const out: RevenueRow[] = [...by.values()].map((r) => {
    const e = economics({ gpv: r.gpv, mdr: r.mdr, wholesale: r.wholesale, processing: r.processing, saas: r.saas, attempts: r.attempts, successes: r.successes }, pol);
    const txnRev = e.recognisedRevenue.minus(e.saas);
    const tr = safeDiv(e.netPaymentRevenue, e.gpv);
    const m = meta.get(r.key);
    return { key: r.key, name: r.name, gpv: r.gpv, attempts: r.attempts, successes: r.successes, mdr: r.mdr, wholesale: r.wholesale, processing: r.processing, saas: e.saas.toString(), txnRevenue: txnRev.toString(), revenue: e.recognisedRevenue.toString(), takeRateBps: tr ? tr.times(10000).toDecimalPlaces(2).toString() : null, activated_at: m?.activated_at ?? null, churned_at: m?.churned_at ?? null, code: m?.code ?? null };
  });
  return out.sort((a, b) => dec(b.revenue).cmp(dec(a.revenue)));
}

export function toBridgeInput(rows: RevenueRow[]): Record<string, MerchantPeriod> {
  return Object.fromEntries(rows.map((r) => [r.key, { gpv: r.gpv, txnRevenue: r.txnRevenue, otherRevenue: r.saas, successes: r.successes }]));
}

export interface EngineMonth { period: string; gpv: string; attempts: string; successes: string; mdr: string; wholesale: string; processing: string; saas: string; txnRevenue: string; revenue: string; takeRateBps: string | null }
/** Monthly transaction-engine economics (GPV, fees, SaaS, recognised revenue). */
export async function engineMonthly(tx: Tx, start: string, end: string, policy?: RevenuePolicy): Promise<EngineMonth[]> {
  const pol = policy ?? policyOf(await tenantInfo(tx));
  const rows = await q<any>(tx, `WITH ${SAAS_CTE},
      t AS (SELECT date_trunc('month', accounting_date)::date AS period, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, count(*) AS attempts, count(*) FILTER (WHERE status='success') AS successes,
              sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wholesale, sum(processing_cost_base) AS processing FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1),
      s AS (SELECT month AS period, sum(fee) AS saas FROM saas GROUP BY 1)
    SELECT period::text, coalesce(t.gpv,0)::text AS gpv, coalesce(t.attempts,0)::text AS attempts, coalesce(t.successes,0)::text AS successes, coalesce(t.mdr,0)::text AS mdr,
      coalesce(t.wholesale,0)::text AS wholesale, coalesce(t.processing,0)::text AS processing, coalesce(s.saas,0)::text AS saas
    FROM t FULL JOIN s USING (period) ORDER BY 1`, [start, end]);
  return rows.map((r) => {
    const e = economics({ gpv: r.gpv, mdr: r.mdr, wholesale: r.wholesale, processing: r.processing, saas: r.saas, attempts: r.attempts, successes: r.successes }, pol);
    const tr = safeDiv(e.netPaymentRevenue, e.gpv);
    return { ...r, txnRevenue: e.recognisedRevenue.minus(e.saas).toString(), revenue: e.recognisedRevenue.toString(), takeRateBps: tr ? tr.times(10000).toDecimalPlaces(2).toString() : null };
  });
}

/** GL revenue by stream and product tag, monthly. */
export async function glRevenueStreams(tx: Tx, start: string, end: string) {
  return q<{ period: string; stream: string; account: string; product: string | null; amount: string }>(tx, `SELECT e.period::text AS period, coalesce(a.revenue_stream,'(unmapped)') AS stream, a.code || ' ' || a.name AS account, p.code AS product,
      sum(e.credit_base - e.debit_base)::text AS amount
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id LEFT JOIN products p ON p.id = e.product_id
    WHERE a.pl_line = 'revenue' AND e.entry_date BETWEEN $1 AND $2 GROUP BY 1,2,3,4 ORDER BY 1,2`, [start, end]);
}

// =====================================================================
// Cost intelligence
// =====================================================================
export const COST_LINES: PlBaseLine[] = ['cost_of_sales', 'opex', 'd_and_a', 'finance_costs'];
export const COST_CATEGORY_LABEL: Record<string, string> = {
  payroll: 'Payroll & benefits', cloud: 'Cloud infrastructure', payment_processing: 'Payment processing', banking: 'Banking services', software: 'Software subscriptions',
  compliance: 'Compliance & regulatory', security: 'Information security', sales_marketing: 'Sales & marketing', admin: 'Administration & office', professional: 'Professional services',
  rnd: 'Research & development', depreciation: 'Depreciation & amortisation', finance: 'Finance costs',
};
export const catLabel = (c: string | null) => (c ? COST_CATEGORY_LABEL[c] ?? c : '(uncategorised)');

/** Expense GL by department (NULL department = unassigned), natural sign. */
export async function costsByDepartment(tx: Tx, start: string, end: string) {
  return q<{ key: string; name: string; category: string | null; amount: string }>(tx, `SELECT coalesce(d.code,'(unassigned)') AS key, coalesce(d.name,'(no department tag)') AS name, a.cost_category AS category, sum(e.debit_base - e.credit_base)::text AS amount
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id LEFT JOIN departments d ON d.id = e.department_id
    WHERE a.pl_line IN ('cost_of_sales','opex','d_and_a','finance_costs') AND e.entry_date BETWEEN $1 AND $2 GROUP BY 1,2,3 ORDER BY 1`, [start, end]);
}
/** Expense GL tagged with product_id. */
export async function costsByProductGl(tx: Tx, start: string, end: string) {
  return q<{ key: string; name: string; amount: string }>(tx, `SELECT p.code AS key, p.name, sum(e.debit_base - e.credit_base)::text AS amount
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id JOIN products p ON p.id = e.product_id
    WHERE a.pl_line IN ('cost_of_sales','opex','d_and_a','finance_costs') AND e.entry_date BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY 3 DESC`, [start, end]);
}
/** Direct transaction costs by product from the fee engine (wholesale + processing). */
export async function directCostsByProduct(tx: Tx, start: string, end: string) {
  return q<{ key: string; name: string; successes: string; wholesale: string; processing: string }>(tx, `SELECT p.code AS key, p.name, count(*) FILTER (WHERE t.status='success')::text AS successes,
      coalesce(sum(t.wholesale_fee_base),0)::text AS wholesale, coalesce(sum(t.processing_cost_base),0)::text AS processing
    FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY 1`, [start, end]);
}

// =====================================================================
// Small helpers shared by pages
// =====================================================================
/** Comparison range: prior period of equal length, or same period last year. */
export function comparisonRange(start: string, end: string, compare: 'prior' | 'yoy'): { start: string; end: string } {
  if (compare === 'yoy') return { start: shiftYears(start, -1), end: shiftYears(end, -1) };
  const isWholeMonths = start === monthStart(start) && end === monthEnd(end);
  if (isWholeMonths) { const n = monthsInRange(start, end).length; const s = addMonths(start, -n); return { start: s, end: monthEnd(addMonths(s, n - 1)) }; }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
  const ce = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const cs = new Date(Date.parse(ce) - days * 86400000).toISOString().slice(0, 10);
  return { start: cs, end: ce };
}

/** Group account-month rows by key → month → amount. */
export function pivot<T extends { period: string; amount: string }>(rows: T[], keyOf: (r: T) => string): Map<string, Map<string, Dec>> {
  const out = new Map<string, Map<string, Dec>>();
  for (const r of rows) {
    const k = keyOf(r); const m = r.period.slice(0, 10);
    if (!out.has(k)) out.set(k, new Map());
    const mm = out.get(k)!; mm.set(m, (mm.get(m) ?? ZERO).plus(dec(r.amount)));
  }
  return out;
}
export const s = (v: Dec | null | undefined, dp = 4): string | null => (v === null || v === undefined ? null : v.toDecimalPlaces(dp).toString());

// =====================================================================
// P&L statement builder (shared by /pnl and the XLSX export)
// =====================================================================
export interface PnlOptions { start: string; end: string; view: PlView; fyStart: number; filter?: GlFilter; materialityPct?: DecLike }
export interface PnlBucket { key: string; label: string; months: string[]; partial: boolean }
export interface PnlRow {
  id: string; label: string; kind: 'base' | 'subtotal' | 'account' | 'margin'; line: PlKey; accountCode?: string; kpi?: string;
  cells: (string | null)[]; total: string | null; budget: string | null; varAbs: string | null; varPct: string | null; favourable: boolean | null; material: boolean;
  py: string | null; pyAbs: string | null; pyPct: string | null; pyFavourable: boolean | null;
}
export interface PnlResult {
  buckets: PnlBucket[]; rows: PnlRow[]; pyRange: { start: string; end: string };
  budget: { versions: { id: string; name: string }[]; coveredMonths: number; totalMonths: number };
  recon: { statementNet: string; glNet: string; difference: string; ok: boolean; entries: string; unmappedNet: string; unmappedEntries: string; debits: string; credits: string; balanced: boolean };
  materiality: string; start: string; end: string; truncatedFrom: string | null;
}

function monthLabelShort(m: string): string { const n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${n[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`; }

export async function buildPnl(tx: Tx, o0: PnlOptions): Promise<PnlResult> {
  // Never compare future (un-booked) months: cap the range at the last month with GL activity.
  const last = await lastActualMonth(tx, o0.end);
  const truncatedTo = last && monthEnd(last) < o0.end && monthEnd(last) >= o0.start ? monthEnd(last) : null;
  const o = { ...o0, end: truncatedTo ?? o0.end };
  const f = o.filter ?? {};
  const mat = dec(o.materialityPct ?? 5);
  const months = monthsInRange(o.start, o.end);
  const bmap = new Map<string, PnlBucket>();
  for (const m of months) {
    const k = bucketOf(m, o.view, o.fyStart);
    if (!bmap.has(k)) bmap.set(k, { key: k, label: o.view === 'monthly' ? monthLabelShort(m) : k, months: [], partial: false });
    bmap.get(k)!.months.push(m);
  }
  const buckets = [...bmap.values()];
  for (const b of buckets) b.partial = o.view === 'quarterly' ? b.months.length < 3 : o.view === 'annual' ? b.months.length < 12 : o.start > b.months[0] || o.end < monthEnd(b.months[0]);
  const pyRange = { start: shiftYears(o.start, -1), end: shiftYears(o.end, -1) };
  const [act, py, bud, rec] = await seq(() => glAccountMonthly(tx, o.start, o.end, f), () => glAccountMonthly(tx, pyRange.start, pyRange.end, f), () => approvedBudgetMonthly(tx, o.start, o.end, o.fyStart, f), () => glPlReconciliation(tx, o.start, o.end, f));
  const accts = await plAccounts(tx);
  const bucketOfMonth = new Map(months.map((m) => [m, bucketOf(m, o.view, o.fyStart)]));
  const bIdx = new Map(buckets.map((b, i) => [b.key, i]));

  // base line × bucket, and account × bucket
  const lineCells = new Map<PlBaseLine, Dec[]>(PL_BASE.map((l) => [l, buckets.map(() => ZERO)]));
  const acctCells = new Map<string, Dec[]>();
  for (const r of act) {
    const i = bIdx.get(bucketOfMonth.get(r.period)!); if (i === undefined) continue;
    lineCells.get(r.pl_line)![i] = lineCells.get(r.pl_line)![i].plus(dec(r.amount));
    if (!acctCells.has(r.code)) acctCells.set(r.code, buckets.map(() => ZERO));
    acctCells.get(r.code)![i] = acctCells.get(r.code)![i].plus(dec(r.amount));
  }
  const acctTotal = (rows: { code: string; amount: string }[]) => { const m = new Map<string, Dec>(); for (const r of rows) m.set(r.code, (m.get(r.code) ?? ZERO).plus(dec(r.amount))); return m; };
  const actA = acctTotal(act), pyA = acctTotal(py), budA = acctTotal(bud.rows);
  const actBase = sumBase(act), pyBase = sumBase(py), budBase = sumBasePresent(bud.rows);
  const actPl = plStatement(actBase), pyPl = plStatement(pyBase), budPl = plStatement(budBase);
  const pyHas = py.length > 0;
  const cellPl = buckets.map((_, i) => plStatement(Object.fromEntries(PL_BASE.map((l) => [l, lineCells.get(l)![i]])) as Record<PlBaseLine, Dec>));

  const mk = (id: string, label: string, kind: PnlRow['kind'], line: PlKey, cells: (Dec | null)[], total: Dec | null, budget: Dec | null, pyv: Dec | null, extra: Partial<PnlRow> = {}): PnlRow => {
    const hb = higherIsBetter(line);
    const v = variance(total, budget, hb);
    const pv = variance(total, pyv, hb);
    return { id, label, kind, line, cells: cells.map((c) => s(c)), total: s(total), budget: s(budget), varAbs: s(v.abs), varPct: s(v.pct, 6), favourable: v.favourable, material: isMaterial(total, budget, mat), py: s(pyv), pyAbs: s(pv.abs), pyPct: s(pv.pct, 6), pyFavourable: pv.favourable, ...extra };
  };
  const rows: PnlRow[] = [];
  for (const L of PL_LAYOUT) {
    const cells = buckets.map((_, i) => cellPl[i][L.key]);
    rows.push(mk(L.key, L.label, L.kind, L.key, cells, actPl[L.key], budPl[L.key], pyHas ? pyPl[L.key] : null, { kpi: L.kpi }));
    if (L.kind === 'base') {
      for (const a of accts.filter((x) => x.pl_line === L.key && (actA.has(x.code) || budA.has(x.code) || pyA.has(x.code)))) {
        rows.push(mk(`${L.key}:${a.code}`, `${a.code} ${a.name}`, 'account', L.key, acctCells.get(a.code) ?? buckets.map(() => ZERO), actA.get(a.code) ?? ZERO, budA.get(a.code) ?? null, pyHas ? pyA.get(a.code) ?? ZERO : null, { accountCode: a.code }));
      }
    }
    if (L.key === 'gross_profit' || L.key === 'ebitda' || L.key === 'net_profit') {
      const mg = (p: PlFull) => (p[L.key] === null || p.revenue === null ? null : safeDiv(p[L.key]!, p.revenue));
      const label = L.key === 'gross_profit' ? 'Gross margin' : L.key === 'ebitda' ? 'EBITDA margin' : 'Net margin';
      const t = mg(actPl), b = mg(budPl), pv = pyHas ? mg(pyPl) : null;
      rows.push({ id: `${L.key}:margin`, label, kind: 'margin', line: L.key, cells: cellPl.map((p) => s(mg(p), 6)), total: s(t, 6), budget: s(b, 6), varAbs: t && b ? s(t.minus(b), 6) : null, varPct: null, favourable: t && b ? (t.eq(b) ? null : t.gt(b)) : null, material: false, py: s(pv, 6), pyAbs: t && pv ? s(t.minus(pv), 6) : null, pyPct: null, pyFavourable: t && pv ? (t.eq(pv) ? null : t.gt(pv)) : null });
    }
  }
  const diff = dec(actPl.net_profit!).minus(rec.glNet);
  const budgetMonths = new Set(bud.rows.map((r) => r.period));
  return {
    buckets, rows, pyRange,
    budget: { versions: bud.versions, coveredMonths: months.filter((m) => budgetMonths.has(m)).length, totalMonths: months.length },
    recon: { statementNet: actPl.net_profit!.toString(), glNet: rec.glNet, difference: diff.toString(), ok: diff.isZero(), entries: rec.entries, unmappedNet: rec.unmappedNet, unmappedEntries: rec.unmappedEntries, debits: rec.debits, credits: rec.credits, balanced: dec(rec.debits).eq(rec.credits) },
    materiality: mat.toString(), start: o.start, end: o.end, truncatedFrom: truncatedTo ? o0.end : null,
  };
}

/**
 * Run tenant-transaction queries one after another. A pg client executes one
 * query at a time anyway; Promise.all on a single client is deprecated in pg.
 */
export async function seq<T extends readonly (() => Promise<unknown>)[]>(...fns: T): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
