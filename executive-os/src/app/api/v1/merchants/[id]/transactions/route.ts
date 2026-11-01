import { handler } from '../../../_h';
import { merchantTransactions } from '@/lib/services/merchants';
export const dynamic = 'force-dynamic';
export const GET = handler('merchant.view', async ({ t, url, params, period }) => {
  const limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 200)); const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
  return { period, transactions: await merchantTransactions(t, params.id, period.start, period.end, { limit, offset, region: url.searchParams.get('region') ?? undefined, acquirer: url.searchParams.get('acquirer') ?? undefined, status: url.searchParams.get('status') ?? undefined }) };
});
