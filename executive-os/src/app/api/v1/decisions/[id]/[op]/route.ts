import { NextResponse } from 'next/server';
import { apiAuth, apiError, json } from '@/lib/api';
import { withTenant } from '@/lib/db';
import { tctx } from '@/lib/auth/session';
import { approveDecision, rejectDecision, transitionDecision, measureOutcome, getDecision } from '@/lib/services/decisions';
export const dynamic = 'force-dynamic';
const PERM: Record<string, any> = { approve: 'decision.approve', reject: 'decision.approve', measure: 'dashboard.view', in_progress: 'decision.propose', implemented: 'decision.propose', closed: 'decision.propose', cancelled: 'decision.propose' };
export async function GET(req: Request, { params }: { params: Promise<{ id: string; op: string }> }) {
  const { id, op } = await params; if (op !== 'detail') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const a = await apiAuth(req, 'dashboard.view'); if (a instanceof Response) return a;
  try { return json({ data: await withTenant(tctx(a), (t) => getDecision(t, id)) }); } catch (e) { return apiError(e); }
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string; op: string }> }) {
  const { id, op } = await params; const perm = PERM[op]; if (!perm) return NextResponse.json({ error: 'unknown operation' }, { status: 404 });
  const a = await apiAuth(req, perm); if (a instanceof Response) return a;
  const body = await req.json().catch(() => ({}));
  const ctx = { tenantId: a.tenantId, userId: a.userId };
  try {
    const out = await withTenant(tctx(a), async (t) => op === 'approve' ? approveDecision(t, ctx, id, body.note) : op === 'reject' ? rejectDecision(t, ctx, id, body.reason ?? 'Rejected') : op === 'measure' ? measureOutcome(t, ctx, id) : transitionDecision(t, ctx, id, op, body.note));
    return json({ data: out ?? { ok: true } });
  } catch (e) { return apiError(e); }
}
