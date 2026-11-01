/** Shared server-side page context: auth, permission, reporting period, tenant transaction. */
import { requireAuth, tctx, type AuthContext } from './auth/session';
import type { Permission } from './auth/permissions';
import { parsePeriod, type Period } from './period';
import { withTenant, q, type Tx } from './db';
import { fiscalYearOf } from './dates';

export type SP = Promise<Record<string, string | string[] | undefined>>;
export function spGet(sp: Record<string, string | string[] | undefined>, k: string): string | undefined { const v = sp[k]; return Array.isArray(v) ? v[0] : v; }

export interface PageCtx { auth: AuthContext; period: Period; sp: Record<string, string | string[] | undefined>; months: string[]; fyears: number[] }

export async function pageContext(searchParams: SP, perm: Permission): Promise<PageCtx> {
  const auth = await requireAuth(perm);
  const sp = await searchParams;
  const period = parsePeriod(spGet(sp, 'range'), auth.fyStartMonth);
  const months = await withTenant(tctx(auth), async (tx) => (await q<{ m: string }>(tx, `SELECT DISTINCT period::text AS m FROM financial_periods ORDER BY 1`)).map((r) => r.m));
  const fyears = Array.from(new Set(months.map((m) => fiscalYearOf(m, auth.fyStartMonth))));
  return { auth, period, sp, months, fyears };
}

export function tx<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>) { return withTenant(tctx(auth), fn); }
