import { NextResponse } from 'next/server';
import { apiAuth, apiError } from '@/lib/api';
import { withTenant, one } from '@/lib/db';
import { tctx } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiAuth(req, 'data.import'); if (a instanceof Response) return a;
  const { id } = await params;
  try {
    const f = await withTenant(tctx(a), async (t) => { const r = await one<any>(t, 'SELECT filename, content, sha256 FROM source_files WHERE batch_id = $1', [id]); if (r) await audit(t, { tenantId: a.tenantId, userId: a.userId, action: 'import.source_file_downloaded', entityType: 'import_batches', entityId: id }); return r; });
    if (!f) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return new NextResponse(new Uint8Array(f.content), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'x-sha256': f.sha256 } });
  } catch (e) { return apiError(e); }
}
