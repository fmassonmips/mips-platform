import { handler, actor } from '../../_h';
import { kpiProof } from '@/lib/services/proof';
export const dynamic = 'force-dynamic';
export const GET = handler('proof.view', async ({ a, t, params, period }) => {
  const p = await kpiProof(t, actor(a), decodeURIComponent(params.code), period.start, period.end);
  if (!p) throw Object.assign(new Error('KPI not found'), { status: 404 });
  const { def, ...rest } = p; const { compute, ...d } = def as any; void compute;
  return { definition: d, ...rest };
});
