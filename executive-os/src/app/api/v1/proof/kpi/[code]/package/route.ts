import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { apiAuth, apiError } from '@/lib/api';
import { withTenant } from '@/lib/db';
import { tctx } from '@/lib/auth/session';
import { parsePeriod } from '@/lib/period';
import { evidencePackage } from '@/lib/services/proof';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiAuth(req, 'proof.export'); if (a instanceof Response) return a;
  const code = decodeURIComponent((await params).code);
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get('range'), a.fyStartMonth);
  try {
    const { body, packageHash } = await withTenant(tctx(a), (t) => evidencePackage(t, { tenantId: a.tenantId, userId: a.userId }, code, period.start, period.end));
    const name = `evidence-${code}-${period.start}_${period.end}`;
    if (url.searchParams.get('format') === 'xlsx') {
      const wb = new ExcelJS.Workbook(); wb.creator = 'MIPS Executive OS';
      const add = (title: string, rows: any[]) => { const ws = wb.addWorksheet(title.slice(0, 31)); if (!rows.length) { ws.addRow(['(none)']); return; } const cols = Object.keys(rows[0]); ws.addRow(cols); for (const r of rows) ws.addRow(cols.map((c) => (typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c]))); ws.getRow(1).font = { bold: true }; };
      add('Summary', [{ code, period: `${period.start}..${period.end}`, value: body.result?.value, confidence: body.result?.confidence, formula: body.formula.formula, formula_version: body.formula.version, formula_hash: body.formula.formula_hash, package_sha256: packageHash, disclaimer: body.disclaimer }]);
      add('Inputs', Object.entries(body.result?.inputs ?? {}).map(([k, v]) => ({ input: k, value: v })));
      add('Controls', body.controls); add('Source batches', body.source_batches); add('Verifications', body.verifications); add('Result history', body.result_history);
      const sr: any = body.supporting_records; add('Supporting records', sr.lines ?? sr.byMerchant ?? sr.accounts ?? sr.invoices ?? []);
      add('Manifest', Object.entries(body.manifest).map(([k, v]) => ({ section: k, sha256: v })));
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf as ArrayBuffer, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${name}.xlsx"`, 'x-package-sha256': packageHash } });
    }
    return new NextResponse(JSON.stringify({ ...body, package_sha256: packageHash }, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${name}.json"`, 'x-package-sha256': packageHash } });
  } catch (e) { return apiError(e); }
}
