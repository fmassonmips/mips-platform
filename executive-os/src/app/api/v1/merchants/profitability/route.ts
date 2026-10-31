import { handler } from '../../_h';
import { economicsBy, GROUP_BY, type GroupBy } from '@/lib/services/merchants';
export const dynamic = 'force-dynamic';
export const GET = handler('merchant.view', async ({ t, url, period }) => {
  const g = (url.searchParams.get('groupBy') ?? 'merchant') as GroupBy;
  if (!(g in GROUP_BY)) throw Object.assign(new Error(`groupBy must be one of ${Object.keys(GROUP_BY).join(', ')}`), { status: 400 });
  const alloc = url.searchParams.get('allocation') as any;
  return { period, groupBy: g, ...(await economicsBy(t, period.start, period.end, g, alloc ? { allocation: alloc } : {})) };
});
