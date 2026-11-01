import { NextResponse } from 'next/server';
import { apiAuth, apiError, json } from '@/lib/api';
import { withTenant } from '@/lib/db';
import { tctx } from '@/lib/auth/session';
import { validateBatch, approveBatch, commitBatch, rejectBatch, getBatch } from '@/lib/services/imports';
export const dynamic = 'force-dynamic';
const PERM: Record<string, any> = { validate: 'data.import', approve: 'data.approve_import', commit: 'data.approve_import', reject: 'data.approve_import' };
export async function GET(req: Request, { params }: { params: Promise<{ id: string; op: string }> }) {
  const { id, op } = await params; if (op !== 'status') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const a = await apiAuth(req, 'data.import'); if (a instanceof Response) return a;
  try { const b = await withTenant(tctx(a), (t) => getBatch(t, id)); return json({ data: { id: b.id, kind: b.kind, status: b.status, validation: b.validation, file_sha256: b.file_sha256 } }); } catch (e) { return apiError(e); }
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string; op: string }> }) {
  const { id, op } = await params; const perm = PERM[op]; if (!perm) return NextResponse.json({ error: 'unknown operation' }, { status: 404 });
  const a = await apiAuth(req, perm); if (a instanceof Response) return a;
  const body = await req.json().catch(() => ({})); const ctx = { tenantId: a.tenantId, userId: a.userId };
  try { const out: unknown = await withTenant<unknown>(tctx(a), (t) => op === 'validate' ? validateBatch(t, ctx, id) : op === 'approve' ? approveBatch(t, ctx, id) : op === 'reject' ? rejectBatch(t, ctx, id, body.reason ?? 'Rejected') : commitBatch(t, ctx, id)); return json({ data: out ?? { ok: true } }); }
  catch (e) { return apiError(e); }
}
