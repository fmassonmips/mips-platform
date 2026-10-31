'use server';
import { redirect } from 'next/navigation';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { runCalculation } from '@/lib/services/kpi';
import { parsePeriod } from '@/lib/period';

export async function runChecksAction(form: FormData) {
  const auth = await requireAuth('kpi.calculate');
  const period = parsePeriod(String(form.get('range') ?? ''), auth.fyStartMonth);
  const id = await withTenant(tctx(auth), (t) => runCalculation(t, { tenantId: auth.tenantId, userId: auth.userId, start: period.start, end: period.end, reason: 'manual run from Formula Audit' }));
  redirect(`/formula-audit?run=${id}&range=${encodeURIComponent(period.key)}`);
}
