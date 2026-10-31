import { z } from 'zod';
import { handler, actor } from '../_h';
import { askAnalyst } from '@/lib/ai/analyst';
export const dynamic = 'force-dynamic';
export const POST = handler('ai.use', async ({ a, t, req, period }) => { const b = z.object({ question: z.string().min(5).max(1000) }).parse(await req.json()); return askAnalyst(t, actor(a), b.question, period.start, period.end); });
