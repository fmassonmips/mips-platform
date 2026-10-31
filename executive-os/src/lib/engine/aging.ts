/** Receivables aging and DSO. */
import { daysBetween } from '../dates';
import { dec, safeDiv, ZERO, type Dec, type DecLike } from '../money';

export const AGING_BUCKETS = ['current', '1_30', '31_60', '61_90', 'over_90'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export const BUCKET_LABELS: Record<AgingBucket, string> = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', over_90: 'Over 90 days' };

export function bucketFor(dueDate: string, asOf: string): AgingBucket {
  const overdue = daysBetween(dueDate, asOf);
  if (overdue <= 0) return 'current';
  if (overdue <= 30) return '1_30';
  if (overdue <= 60) return '31_60';
  if (overdue <= 90) return '61_90';
  return 'over_90';
}

export function agingSummary(invoices: { dueDate: string; outstanding: DecLike }[], asOf: string): Record<AgingBucket, Dec> {
  const out = Object.fromEntries(AGING_BUCKETS.map((b) => [b, ZERO])) as Record<AgingBucket, Dec>;
  for (const i of invoices) { const b = bucketFor(i.dueDate, asOf); out[b] = out[b].plus(dec(i.outstanding)); }
  return out;
}

/** DSO = closing receivables / credit sales in period × days in period. */
export function dso(closingAr: DecLike, creditSales: DecLike, days: number): Dec | null {
  return safeDiv(dec(closingAr).times(days), creditSales);
}
