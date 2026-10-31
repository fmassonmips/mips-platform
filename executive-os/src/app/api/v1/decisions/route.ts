import { z } from 'zod';
import { handler, actor } from '../_h';
import { listDecisions, createDecision } from '@/lib/services/decisions';
export const dynamic = 'force-dynamic';
export const GET = handler('dashboard.view', async ({ t }) => listDecisions(t));
const body = z.object({ title: z.string().min(5), description: z.string().min(10), rationale: z.string().min(10), scenario_id: z.string().uuid().optional(), owner_user_id: z.string().uuid(), approver_user_id: z.string().uuid(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), evidence: z.array(z.object({ kind: z.string(), ref: z.string(), note: z.string().optional() })).default([]) });
export const POST = handler('decision.propose', async ({ a, t, req }) => { const b = body.parse(await req.json()); return createDecision(t, actor(a), { title: b.title, description: b.description, rationale: b.rationale, scenarioId: b.scenario_id, ownerUserId: b.owner_user_id, approverUserId: b.approver_user_id, deadline: b.deadline, evidence: b.evidence }); });
