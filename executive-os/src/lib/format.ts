/** Presentation formatting. Input values are decimal strings from the server. */
import { dec, D } from './money';

export function fmtMoney(v: string | null | undefined, ccy = 'MUR', opts: { compact?: boolean; dp?: number } = {}): string {
  if (v === null || v === undefined) return '—';
  const d = dec(v);
  const dp = opts.dp ?? 0;
  if (opts.compact) {
    const abs = d.abs();
    const units: [string, number][] = [['bn', 1e9], ['m', 1e6], ['k', 1e3]];
    for (const [u, n] of units) {
      if (abs.gte(n)) return `${ccy} ${groupDigits(d.div(n).toDecimalPlaces(abs.gte(n * 100) ? 0 : 1, D.ROUND_HALF_UP).toFixed(abs.gte(n * 100) ? 0 : 1))}${u}`;
    }
  }
  return `${ccy} ${groupDigits(d.toDecimalPlaces(dp, D.ROUND_HALF_UP).toFixed(dp))}`;
}

export function fmtNumber(v: string | number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || v === '') return '—';
  return groupDigits(dec(v).toDecimalPlaces(dp, D.ROUND_HALF_UP).toFixed(dp));
}

/** v is a FRACTION (0.0525 -> 5.25 %) */
export function fmtPct(v: string | null | undefined, dp = 1): string {
  if (v === null || v === undefined) return '—';
  return `${dec(v).times(100).toDecimalPlaces(dp, D.ROUND_HALF_UP).toFixed(dp)}%`;
}

export function fmtBps(v: string | null | undefined, dp = 1): string {
  if (v === null || v === undefined) return '—';
  return `${dec(v).toDecimalPlaces(dp, D.ROUND_HALF_UP).toFixed(dp)} bps`;
}

export function fmtValue(v: string | null | undefined, unit: string, ccy = 'MUR', compact = true): string {
  switch (unit) {
    case 'money': return fmtMoney(v, ccy, { compact });
    case 'percent': return fmtPct(v);
    case 'bps': return fmtBps(v);
    case 'days': return v === null || v === undefined ? '—' : `${fmtNumber(v, 1)} d`;
    case 'months': return v === null || v === undefined ? '—' : `${fmtNumber(v, 1)} mo`;
    case 'ratio': return v === null || v === undefined ? '—' : fmtNumber(v, 2);
    default: return fmtNumber(v, 0);
  }
}

function groupDigits(s: string): string {
  const neg = s.startsWith('-');
  const [int, frac] = (neg ? s.slice(1) : s).split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${g}${frac ? '.' + frac : ''}`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  return s.slice(0, 10);
}

export function monthLabel(period: string): string {
  const [y, m] = period.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}
