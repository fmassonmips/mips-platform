/**
 * Reporting period selection. URL parameter `range`:
 *   m:2026-10            month          q:2026-Q3        calendar quarter
 *   y:2026               calendar year  fy:2027          fiscal year (tenant FY start month)
 *   c:2026-01-01..2026-03-31  custom range
 *   ytd / fytd           year/fiscal-year to date (as of the latest complete data month)
 * Default: the latest month with data (the current month in the demo).
 */
import { addMonths, fiscalYearStart, monthEnd, monthStart, quarterOf, addDays, fiscalYearOf } from './dates';

export interface Period { key: string; kind: 'm' | 'q' | 'y' | 'fy' | 'c'; start: string; end: string; label: string; months: number }

export function todayISO(): string { return process.env.APP_TODAY ?? new Date().toISOString().slice(0, 10); }
export function defaultMonth(): string { return monthStart(todayISO()); }

export function parsePeriod(raw: string | undefined | null, fyStart = 7): Period {
  const r = (raw ?? '').trim();
  try {
    if (/^m:\d{4}-\d{2}$/.test(r)) { const s = `${r.slice(2)}-01`; return { key: r, kind: 'm', start: s, end: monthEnd(s), label: monthName(s), months: 1 }; }
    if (/^q:\d{4}-Q[1-4]$/.test(r)) { const y = r.slice(2, 6), q = Number(r.slice(-1)); const s = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; return { key: r, kind: 'q', start: s, end: monthEnd(addMonths(s, 2)), label: `Q${q} ${y}`, months: 3 }; }
    if (/^y:\d{4}$/.test(r)) { const y = r.slice(2); return { key: r, kind: 'y', start: `${y}-01-01`, end: `${y}-12-31`, label: `CY ${y}`, months: 12 }; }
    if (/^fy:\d{4}$/.test(r)) { const fy = Number(r.slice(3)); const s = fiscalYearStart(fy, fyStart); return { key: r, kind: 'fy', start: s, end: addDays(addMonths(s, 12), -1), label: `FY${fy}`, months: 12 }; }
    if (/^c:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(r)) { const [s, e] = r.slice(2).split('..'); if (s <= e) { const months = Math.max(1, Math.round((Date.parse(e) - Date.parse(s)) / 2.63e9)); return { key: r, kind: 'c', start: s, end: e, label: `${s} → ${e}`, months }; } }
    if (r === 'ytd') { const t = defaultMonth(); const s = `${t.slice(0, 4)}-01-01`; return { key: r, kind: 'c', start: s, end: monthEnd(t), label: `YTD ${t.slice(0, 4)}`, months: Number(t.slice(5, 7)) }; }
    if (r === 'fytd') { const t = defaultMonth(); const fy = fiscalYearOf(t, fyStart); const s = fiscalYearStart(fy, fyStart); return { key: r, kind: 'c', start: s, end: monthEnd(t), label: `FY${fy} to date`, months: Math.round((Date.parse(monthEnd(t)) - Date.parse(s)) / 2.63e9) }; }
  } catch { /* fall through */ }
  const s = defaultMonth();
  return { key: `m:${s.slice(0, 7)}`, kind: 'm', start: s, end: monthEnd(s), label: monthName(s), months: 1 };
}

export function monthName(s: string): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
}

/** Last n month starts ending at the month of `end`. */
export function trailingMonths(end: string, n: number): string[] {
  const out: string[] = []; let m = monthStart(end);
  for (let i = 0; i < n; i++) { out.unshift(m); m = addMonths(m, -1); }
  return out;
}
export { quarterOf };
