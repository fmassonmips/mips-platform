import { handler } from '../_h';
import { ensureRun, resultsForRun } from '@/lib/services/kpi';
export const dynamic = 'force-dynamic';
export const GET = handler('dashboard.view', async ({ a, t, period }) => {
  const { runId } = await ensureRun(t, { tenantId: a.tenantId, userId: a.userId, start: period.start, end: period.end, reason: 'api' });
  return { period, calc_run_id: runId, results: await resultsForRun(t, runId) };
});
