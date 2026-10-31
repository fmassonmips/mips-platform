/** CSV export of the executive action register (strategy.view). */
import { NextResponse } from 'next/server';
import { getAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { todayISO } from '@/lib/period';
import { listActions } from '@/lib/services/strategy';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!auth.permissions.has('strategy.view')) return NextResponse.json({ error: 'forbidden', permission: 'strategy.view' }, { status: 403 });
  const today = todayISO();
  const rows = await withTenant(tctx(auth), (t) => listActions(t, today));
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['code', 'title', 'source_type', 'source', 'owner', 'due_date', 'status', 'overdue', 'created_by', 'created_at', 'completed_at'];
  const lines = [head.join(','), ...rows.map((a) => [a.code, a.title, a.source_type, a.source_label, a.owner_name, a.due_date, a.status, a.overdue ? 'yes' : 'no', a.created_by_name, a.created_at, a.completed_at].map(esc).join(','))];
  return new NextResponse(lines.join('\n') + '\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="action-register-${auth.tenantCode}-${today}.csv"` } });
}
