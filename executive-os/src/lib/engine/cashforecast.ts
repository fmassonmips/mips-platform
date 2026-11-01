/**
 * Rolling 13-week cash forecast (operating cash only — restricted, safeguarded
 * and merchant funds are excluded by construction: callers pass operating
 * balances only).
 */
import { addDays, daysBetween, parseISO, toISO } from '../dates';
import { dec, ONE, ZERO, type Dec, type DecLike } from '../money';

export const FORECAST_CATEGORIES = ['customer_receipts', 'merchant_obligations', 'payroll', 'supplier_payments', 'taxes', 'regulatory', 'loan_repayments', 'capex', 'other_in', 'other_out'] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

export interface Receivable { id: string; dueDate: string; outstanding: DecLike; disputed: boolean; promiseDate?: string | null }
export interface Payable { id: string; dueDate: string; scheduledDate?: string | null; amount: DecLike; status: string; priority: string }
export interface RecurringItem { category: ForecastCategory; description: string; amount: DecLike; recurrence: 'once' | 'weekly' | 'monthly'; startDate: string; endDate?: string | null; dayOfMonth?: number | null }

export interface ScenarioParams { key: 'base' | 'optimistic' | 'pessimistic' | string; receiptDelayDays: number; collectionRate: DecLike; disputedCollectionRate: DecLike; outflowFactor: DecLike }
export const DEFAULT_SCENARIOS: ScenarioParams[] = [
  { key: 'base', receiptDelayDays: 7, collectionRate: '0.97', disputedCollectionRate: '0.5', outflowFactor: '1' },
  { key: 'optimistic', receiptDelayDays: 0, collectionRate: '1', disputedCollectionRate: '0.8', outflowFactor: '0.97' },
  { key: 'pessimistic', receiptDelayDays: 30, collectionRate: '0.9', disputedCollectionRate: '0', outflowFactor: '1.05' },
];

export interface ForecastWeek { weekStart: string; opening: Dec; flows: Record<ForecastCategory, Dec>; inflows: Dec; outflows: Dec; net: Dec; closing: Dec; belowMinimum: boolean }
export interface ForecastResult { scenario: string; weeks: ForecastWeek[]; minClosing: Dec; minWeek: string; totalIn: Dec; totalOut: Dec; liquidityGapWeeks: string[] }

function emptyFlows(): Record<ForecastCategory, Dec> {
  return Object.fromEntries(FORECAST_CATEGORIES.map((c) => [c, ZERO])) as Record<ForecastCategory, Dec>;
}

function weekIndex(start: string, date: string): number { return Math.floor(daysBetween(start, date) / 7); }

function occurrences(item: RecurringItem, from: string, to: string): string[] {
  const out: string[] = [];
  const end = item.endDate && item.endDate < to ? item.endDate : to;
  if (item.recurrence === 'once') { if (item.startDate >= from && item.startDate <= end) out.push(item.startDate); return out; }
  if (item.recurrence === 'weekly') { let d = item.startDate; while (d < from) d = addDays(d, 7); while (d <= end) { out.push(d); d = addDays(d, 7); } return out; }
  // monthly
  const dom = item.dayOfMonth ?? Number(item.startDate.slice(8, 10));
  const cur = parseISO(from); cur.setUTCDate(1);
  for (let i = 0; i < 5; i++) {
    const y = cur.getUTCFullYear(), m = cur.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = toISO(new Date(Date.UTC(y, m, Math.min(dom, last))));
    if (d >= from && d <= end && d >= item.startDate) out.push(d);
    cur.setUTCMonth(m + 1);
  }
  return out;
}

export function forecast13w(p: { startWeek: string; openingCash: DecLike; minimumLiquidity: DecLike; receivables: Receivable[]; payables: Payable[]; items: RecurringItem[]; scenario: ScenarioParams; weeks?: number }): ForecastResult {
  const n = p.weeks ?? 13;
  const end = addDays(p.startWeek, n * 7 - 1);
  const buckets = Array.from({ length: n }, () => emptyFlows());
  const add = (date: string, cat: ForecastCategory, amt: Dec) => {
    let idx = weekIndex(p.startWeek, date);
    if (idx < 0) idx = 0;            // overdue items expected in week 1
    if (idx >= n) return;
    buckets[idx][cat] = buckets[idx][cat].plus(amt);
  };
  const s = p.scenario; const of = dec(s.outflowFactor);
  for (const r of p.receivables) {
    const base = r.promiseDate && r.promiseDate > r.dueDate ? r.promiseDate : r.dueDate;
    const expected = addDays(base, s.receiptDelayDays);
    const rate = r.disputed ? dec(s.disputedCollectionRate) : dec(s.collectionRate);
    add(expected < p.startWeek ? p.startWeek : expected, 'customer_receipts', dec(r.outstanding).times(rate));
  }
  for (const py of p.payables) {
    if (py.status === 'paid' || py.status === 'rejected') continue;
    const d = py.scheduledDate ?? py.dueDate;
    add(d, 'supplier_payments', dec(py.amount).neg());
  }
  for (const it of p.items) {
    for (const d of occurrences(it, p.startWeek, end)) {
      const a = dec(it.amount);
      add(d, it.category, a.lt(0) ? a.times(of) : a);
    }
  }
  let opening = dec(p.openingCash); const minL = dec(p.minimumLiquidity);
  const weeks: ForecastWeek[] = []; let totalIn = ZERO, totalOut = ZERO;
  for (let i = 0; i < n; i++) {
    const flows = buckets[i];
    let inflows = ZERO, outflows = ZERO;
    for (const c of FORECAST_CATEGORIES) { const v = flows[c]; if (v.gte(0)) inflows = inflows.plus(v); else outflows = outflows.plus(v); }
    const net = inflows.plus(outflows); const closing = opening.plus(net);
    weeks.push({ weekStart: addDays(p.startWeek, i * 7), opening, flows, inflows, outflows, net, closing, belowMinimum: closing.lt(minL) });
    totalIn = totalIn.plus(inflows); totalOut = totalOut.plus(outflows); opening = closing;
  }
  let minW = weeks[0];
  for (const w of weeks) if (w.closing.lt(minW.closing)) minW = w;
  return { scenario: s.key, weeks, minClosing: minW.closing, minWeek: minW.weekStart, totalIn, totalOut, liquidityGapWeeks: weeks.filter((w) => w.belowMinimum).map((w) => w.weekStart) };
}

/** Sensitivity of minimum closing cash to additional collection delays. */
export function collectionDelaySensitivity(p: Parameters<typeof forecast13w>[0], delays = [0, 15, 30, 45, 60]) {
  return delays.map((d) => {
    const r = forecast13w({ ...p, scenario: { ...p.scenario, receiptDelayDays: p.scenario.receiptDelayDays + d } });
    return { extraDelayDays: d, minClosing: r.minClosing, minWeek: r.minWeek, gapWeeks: r.liquidityGapWeeks.length, endCash: r.weeks[r.weeks.length - 1].closing };
  });
}
export { ONE };
