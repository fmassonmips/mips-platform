import { z } from 'zod';
import { handler, actor } from '../_h';
import { listScenarios, createScenario } from '@/lib/services/decisions';
import { TEMPLATES } from '@/lib/engine/scenarios';
export const dynamic = 'force-dynamic';
export const GET = handler('dashboard.view', async ({ t }) => ({ templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, { label: v.label, description: v.description, fields: Object.keys((v.schema as any).shape) }])), scenarios: await listScenarios(t) }));
const body = z.object({ name: z.string().min(3), template: z.string(), assumptions: z.record(z.any()), comparison_group: z.string().optional(), description: z.string().optional() });
export const POST = handler('scenario.manage', async ({ a, t, req }) => { const b = body.parse(await req.json()); return createScenario(t, actor(a), { name: b.name, template: b.template as any, assumptions: b.assumptions, comparisonGroup: b.comparison_group, description: b.description }); });
