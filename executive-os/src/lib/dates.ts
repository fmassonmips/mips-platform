/** Date helpers operating on ISO date strings (YYYY-MM-DD), UTC-based, no TZ drift. */
export type ISODate = string;

export function parseISO(d: ISODate): Date { return new Date(`${d}T00:00:00Z`); }
export function toISO(d: Date): ISODate { return d.toISOString().slice(0, 10); }
export function monthStart(d: ISODate): ISODate { return `${d.slice(0, 7)}-01`; }
export function addDays(d: ISODate, n: number): ISODate { const x = parseISO(d); x.setUTCDate(x.getUTCDate() + n); return toISO(x); }
export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseISO(monthStart(d)); x.setUTCMonth(x.getUTCMonth() + n); return toISO(x);
}
export function monthEnd(d: ISODate): ISODate { return addDays(addMonths(d, 1), -1); }
export function daysBetween(a: ISODate, b: ISODate): number { return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000); }
export function monthsInRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []; let m = monthStart(start);
  while (m <= end) { out.push(m); m = addMonths(m, 1); }
  return out;
}
export function quarterOf(d: ISODate): string { const m = Number(d.slice(5, 7)); return `${d.slice(0, 4)}-Q${Math.ceil(m / 3)}`; }
export function quarterStart(d: ISODate): ISODate { const m = Number(d.slice(5, 7)); const qm = Math.floor((m - 1) / 3) * 3 + 1; return `${d.slice(0, 4)}-${String(qm).padStart(2, '0')}-01`; }
/** Monday of the ISO week containing d */
export function weekStart(d: ISODate): ISODate { const x = parseISO(d); const dow = (x.getUTCDay() + 6) % 7; return addDays(d, -dow); }
/** Fiscal year label (calendar year in which the FY ends) */
export function fiscalYearOf(d: ISODate, fyStartMonth: number): number {
  const y = Number(d.slice(0, 4)); const m = Number(d.slice(5, 7));
  return fyStartMonth === 1 ? y : (m >= fyStartMonth ? y + 1 : y);
}
export function fiscalYearStart(fy: number, fyStartMonth: number): ISODate {
  const y = fyStartMonth === 1 ? fy : fy - 1; return `${y}-${String(fyStartMonth).padStart(2, '0')}-01`;
}
