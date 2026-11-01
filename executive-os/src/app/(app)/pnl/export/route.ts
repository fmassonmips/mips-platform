/**
 * XLSX export of the P&L statement (same builder as the /pnl page).
 * Auth: session cookie → 401 JSON if absent, 403 JSON without finance.view.
 */
import ExcelJS from 'exceljs';
import { getAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { audit } from '@/lib/audit';
import { parsePeriod } from '@/lib/period';
import { buildPnl, departments, productsList, materialityPct, type PlView, seq } from '@/lib/services/finance';

export const dynamic = 'force-dynamic';

const num = (v: string | null) => (v === null ? null : Number(v)); // presentation only (spreadsheet cell)

export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!auth.permissions.has('finance.view')) return Response.json({ error: 'forbidden', missing: 'finance.view' }, { status: 403 });
  const url = new URL(req.url);
  const range = url.searchParams.get('range');
  const period = parsePeriod(range ?? 'fytd', auth.fyStartMonth);
  const view: PlView = (['monthly', 'quarterly', 'annual'] as const).find((v) => v === url.searchParams.get('view')) ?? 'monthly';
  const deptCode = url.searchParams.get('dept') ?? '';
  const prodCode = url.searchParams.get('product') ?? '';

  const { pnl, dept, prod } = await withTenant(tctx(auth), async (t) => {
    const [deps, prods] = await seq(() => departments(t), () => productsList(t));
    const dept = deps.find((d) => d.code === deptCode) ?? null;
    const prod = prods.find((p) => p.code === prodCode) ?? null;
    const pnl = await buildPnl(t, { start: period.start, end: period.end, view, fyStart: auth.fyStartMonth, filter: { departmentId: dept?.id, productId: prod?.id }, materialityPct: materialityPct(auth.settings) });
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'pnl.exported', entityType: 'report', payload: { format: 'xlsx', range: period.key, view, dept: dept?.code ?? null, product: prod?.code ?? null } });
    return { pnl, dept, prod };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MIPS Executive OS'; wb.created = new Date();
  const ws = wb.addWorksheet('P&L', { views: [{ state: 'frozen', xSplit: 1, ySplit: 6 }] });
  ws.addRow([`${auth.tenantName} — Profit & Loss (${auth.baseCurrency})`]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${period.label} (${pnl.start} → ${pnl.end}${pnl.truncatedFrom ? `, capped at last month with GL postings; selected to ${pnl.truncatedFrom}` : ''}) · view: ${view}${dept ? ` · department: ${dept.name}` : ''}${prod ? ` · product: ${prod.name}` : ''}`]);
  ws.addRow([`Budget: ${pnl.budget.versions.map((v) => v.name).join(', ') || 'none'} (${pnl.budget.coveredMonths}/${pnl.budget.totalMonths} months) · Prior year: ${pnl.pyRange.start} → ${pnl.pyRange.end}`]);
  ws.addRow([auth.isDemo ? 'DEMO tenant — synthetic data, not actual MIPSIT Digital Ltd results.' : `Generated ${new Date().toISOString()}`]).font = { italic: true, color: { argb: 'FF8A6D1F' } };
  ws.addRow([]);
  const header = ['Line', ...pnl.buckets.map((b) => b.label + (b.partial ? '*' : '')), 'Total', 'Budget', 'Variance', 'Variance %', 'Prior year', 'Δ vs PY %', 'Material'];
  const h = ws.addRow(header);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173166' } }; });
  const nCols = header.length;
  for (const r of pnl.rows) {
    const isPct = r.kind === 'margin';
    const label = r.kind === 'account' ? `    ${r.label}` : r.kind === 'margin' ? `  ${r.label}` : r.label;
    const row = ws.addRow([label, ...r.cells.map(num), num(r.total), num(r.budget), num(r.varAbs), isPct ? null : num(r.varPct), num(r.py), isPct ? null : num(r.pyPct), r.material ? 'M' : '']);
    for (let c = 2; c <= nCols - 1; c++) {
      const isPctCol = isPct || c === nCols - 3 || c === nCols - 1; // Variance % and Δ vs PY % columns
      row.getCell(c).numFmt = isPctCol ? '0.0%' : '#,##0;[Red]-#,##0';
    }
    if (r.kind === 'subtotal') row.font = { bold: true };
    if (r.kind === 'account') row.font = { color: { argb: 'FF555555' } };
    if (r.kind === 'margin') row.font = { italic: true };
  }
  ws.getColumn(1).width = 46;
  for (let c = 2; c <= nCols; c++) ws.getColumn(c).width = 14;
  ws.addRow([]);
  ws.addRow(['Reconciliation']).font = { bold: true };
  ws.addRow(['Statement net profit', Number(pnl.recon.statementNet)]).getCell(2).numFmt = '#,##0.00';
  ws.addRow(['Σ (credit − debit) on P&L-mapped GL accounts', Number(pnl.recon.glNet)]).getCell(2).numFmt = '#,##0.00';
  ws.addRow(['Difference', Number(pnl.recon.difference), pnl.recon.ok ? 'RECONCILED' : 'BREAK']).getCell(2).numFmt = '#,##0.00';
  ws.addRow(['GL entries on P&L accounts', Number(pnl.recon.entries)]);
  ws.addRow(['Unmapped revenue/expense entries (excluded)', Number(pnl.recon.unmappedEntries)]);
  ws.addRow([]);
  ws.addRow(['Source: gl_entries ⨝ chart_of_accounts (pl_line); budget_lines of approved budget versions. * = partial bucket. Variance = actual − budget.']).font = { italic: true, size: 9 };

  const buf = await wb.xlsx.writeBuffer();
  const fname = `pnl_${period.key.replace(/[^a-zA-Z0-9-]+/g, '_')}_${view}.xlsx`;
  return new Response(buf as ArrayBuffer, { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${fname}"`, 'Cache-Control': 'no-store' } });
}
