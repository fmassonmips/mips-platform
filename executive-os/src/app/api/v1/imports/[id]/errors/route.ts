import { NextResponse } from 'next/server';
import { apiAuth, apiError } from '@/lib/api';
import { withTenant, q } from '@/lib/db';
import { tctx } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiAuth(req, 'data.import'); if (a instanceof Response) return a;
  const { id } = await params;
  try {
    const rows = await withTenant(tctx(a), (t) => q<any>(t, `SELECT row_number, status, errors, raw FROM import_source_rows WHERE batch_id = $1 AND status IN ('error','duplicate') ORDER BY row_number`, [id]));
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = ['row_number,status,messages,original_row', ...rows.map((r) => [r.row_number, r.status, esc((r.errors ?? []).join('; ')), esc(JSON.stringify(r.raw))].join(','))].join('\n');
    return new NextResponse(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="import-${id.slice(0, 8)}-errors.csv"` } });
  } catch (e) { return apiError(e); }
}
