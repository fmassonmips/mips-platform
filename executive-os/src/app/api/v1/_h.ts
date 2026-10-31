import { withTenant } from '@/lib/db';
import { apiAuth, apiError, json } from '@/lib/api';
import { tctx, type AuthContext } from '@/lib/auth/session';
import type { Permission } from '@/lib/auth/permissions';
import type { Tx } from '@/lib/db';
import { parsePeriod } from '@/lib/period';
/** Wrap a /api/v1 handler: auth + permission + tenant transaction + uniform errors. */
export function handler(perm: Permission, fn: (ctx: { a: AuthContext; t: Tx; url: URL; req: Request; params: any; period: ReturnType<typeof parsePeriod> }) => Promise<unknown>) {
  return async (req: Request, { params }: { params: Promise<any> }) => {
    const a = await apiAuth(req, perm); if (a instanceof Response) return a;
    try {
      const url = new URL(req.url); const p = await params;
      const out = await withTenant(tctx(a), (t) => fn({ a, t, url, req, params: p, period: parsePeriod(url.searchParams.get('range'), a.fyStartMonth) }));
      return out instanceof Response ? out : json({ data: out, meta: { tenant: a.tenantCode, demo: a.isDemo } });
    } catch (e) { return apiError(e); }
  };
}
export const actor = (a: AuthContext) => ({ tenantId: a.tenantId, userId: a.userId });
