import { NextResponse } from 'next/server';
import { apiAuth, apiError } from '@/lib/api';
import { withTenant } from '@/lib/db';
import { tctx } from '@/lib/auth/session';
import { getReport } from '@/lib/services/reports';
import { renderPdf, renderXlsx } from '@/lib/reports/render';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiAuth(req, 'dashboard.view'); if (a instanceof Response) return a;
  const { id } = await params; const format = new URL(req.url).searchParams.get('format') ?? 'pdf';
  try {
    const r = await withTenant(tctx(a), async (t) => { const x = await getReport(t, id); if (x) await audit(t, { tenantId: a.tenantId, userId: a.userId, action: 'report.exported', entityType: 'reports', entityId: id, payload: { format } }); return x; });
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const base = `${r.kind}-${r.period_start}_${r.period_end}`;
    if (format === 'xlsx') return new NextResponse(new Uint8Array(await renderXlsx(r)), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${base}.xlsx"` } });
    if (format === 'json') return NextResponse.json({ id: r.id, sha256: r.content_sha256, ...r.content });
    return new NextResponse(new Uint8Array(await renderPdf(r)), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${base}.pdf"` } });
  } catch (e) { return apiError(e); }
}
