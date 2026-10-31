'use server';
import { redirect } from 'next/navigation';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { generateReport, REPORT_KINDS, type ReportKind } from '@/lib/services/reports';
import { askAnalyst, type AnalystAnswer } from '@/lib/ai/analyst';
import { parsePeriod } from '@/lib/period';

export interface RState { error?: string; answer?: AnalystAnswer }
export async function generateReportAction(_: RState, form: FormData): Promise<RState> {
  const auth = await requireAuth('report.generate');
  const kind = String(form.get('kind')) as ReportKind;
  if (!(kind in REPORT_KINDS)) return { error: 'Unknown report type' };
  const p = parsePeriod(String(form.get('range') ?? ''), auth.fyStartMonth);
  const decisionId = String(form.get('decisionId') ?? '') || undefined;
  let id: string;
  try { id = await withTenant(tctx(auth), (t) => generateReport(t, { tenantId: auth.tenantId, userId: auth.userId }, kind, p.start, p.end, { decisionId })); }
  catch (e) { return { error: (e as Error).message }; }
  redirect(`/reports/${id}`);
}
export async function askAction(_: RState, form: FormData): Promise<RState> {
  const auth = await requireAuth('ai.use');
  const question = String(form.get('question') ?? '').trim().slice(0, 1000);
  if (question.length < 5) return { error: 'Ask a question (≥ 5 characters).' };
  const p = parsePeriod(String(form.get('range') ?? ''), auth.fyStartMonth);
  try { return { answer: await withTenant(tctx(auth), (t) => askAnalyst(t, { tenantId: auth.tenantId, userId: auth.userId }, question, p.start, p.end)) }; }
  catch (e) { return { error: (e as Error).message }; }
}
