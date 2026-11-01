import { z } from 'zod';
import { handler, actor } from '../_h';
import { listReports, generateReport, REPORT_KINDS } from '@/lib/services/reports';
export const dynamic = 'force-dynamic';
export const GET = handler('dashboard.view', async ({ t }) => listReports(t));
const body = z.object({ kind: z.enum(Object.keys(REPORT_KINDS) as [string, ...string[]]), decision_id: z.string().uuid().optional() });
export const POST = handler('report.generate', async ({ a, t, req, period }) => { const b = body.parse(await req.json()); return { report_id: await generateReport(t, actor(a), b.kind as any, period.start, period.end, { decisionId: b.decision_id }) }; });
