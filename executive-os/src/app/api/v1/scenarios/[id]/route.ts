import { handler } from '../../_h';
import { getScenario } from '@/lib/services/decisions';
export const dynamic = 'force-dynamic';
export const GET = handler('dashboard.view', async ({ t, params }) => { const s = await getScenario(t, params.id); if (!s) throw Object.assign(new Error('Scenario not found'), { status: 404 }); return s; });
