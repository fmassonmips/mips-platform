/** Render frozen report content to PDF (pdfkit) and Excel (exceljs). */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { Section } from '../services/reports';

const NAVY = '#0E2148', GOLD = '#B8923D', MUTED = '#626C7E';

export async function renderPdf(report: any): Promise<Buffer> {
  const c = report.content;
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: c.title, Author: 'MIPS Executive OS' } });
  const chunks: Buffer[] = []; doc.on('data', (b) => chunks.push(b));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const W = doc.page.width - 96;
  // Cover
  doc.rect(0, 0, doc.page.width, 140).fill(NAVY);
  doc.fillColor(GOLD).fontSize(10).text('MIPS EXECUTIVE OS', 48, 40);
  doc.fillColor('#FFFFFF').fontSize(20).text(c.title, 48, 60, { width: W });
  doc.fillColor('#FFFFFF').fontSize(10).text(`${c.tenant} · Period ${c.period.start} → ${c.period.end}`, 48, 110);
  doc.moveDown(4).fillColor('#000');
  if (c.is_demo) { doc.fillColor('#B00020').fontSize(10).text('DEMO DATA — synthetic figures; not actual MIPSIT Digital Ltd results.', 48, 160); }
  doc.fillColor(MUTED).fontSize(8).text(`Generated ${report.generated_at instanceof Date ? report.generated_at.toISOString() : report.generated_at} by ${report.generated_by_name ?? 'system'} · Data refresh: run ${c.data_refresh.calculation_run} (${String(c.data_refresh.calculated_at)}), latest transaction ${c.data_refresh.latest_transaction}, GL ${c.data_refresh.latest_gl_entry} · Content SHA-256 ${report.content_sha256}`, 48, 176, { width: W });
  doc.fillColor('#000').fontSize(9).text(`Data validation: ${report.data_status}. ${c.validation.note}`, 48, doc.y + 6, { width: W });
  doc.moveDown();
  const ensure = (h: number) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
  const table = (s: Extract<Section, { type: 'table' }>) => {
    if (s.title) { ensure(30); doc.fontSize(10).fillColor(NAVY).text(s.title, 48, doc.y + 4, { width: W }); doc.moveDown(0.3); }
    const n = s.columns.length; const colW = W / n;
    const row = (cells: (string | null)[], bold = false) => {
      const hs = cells.map((t, i) => doc.heightOfString(String(t ?? '—'), { width: colW - 6 }));
      const h = Math.max(...hs) + 6; ensure(h); const y = doc.y;
      cells.forEach((t, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? NAVY : '#111').text(String(t ?? '—'), 48 + i * colW + 3, y + 3, { width: colW - 6, align: s.align?.[i] === 'r' ? 'right' : 'left' }));
      doc.moveTo(48, y + h).lineTo(48 + W, y + h).strokeColor('#E2E5EB').lineWidth(0.5).stroke(); doc.y = y + h;
    };
    row(s.columns, true); for (const r of s.rows) row(r); doc.font('Helvetica').moveDown(0.6);
  };
  for (const s of c.sections as Section[]) {
    if (s.type === 'heading') { ensure(40); doc.moveDown(0.5).font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(s.text, 48, doc.y, { width: W }); doc.moveTo(48, doc.y + 2).lineTo(48 + 60, doc.y + 2).strokeColor(GOLD).lineWidth(2).stroke(); doc.font('Helvetica').moveDown(0.6); }
    else if (s.type === 'paragraph') { ensure(30); doc.fontSize(9).fillColor('#111').text(s.text, 48, doc.y, { width: W }); doc.moveDown(0.5); }
    else if (s.type === 'callout') { ensure(40); doc.fontSize(9).fillColor(s.tone === 'neg' ? '#B00020' : s.tone === 'pos' ? '#168052' : NAVY).font('Helvetica-Bold').text(s.title, 48, doc.y, { width: W }).font('Helvetica').fillColor('#111').text(s.text, { width: W }); doc.moveDown(0.5); }
    else if (s.type === 'table') table(s);
    else if (s.type === 'statements') { if (s.title) { ensure(24); doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(s.title, 48, doc.y, { width: W }).font('Helvetica'); } for (const it of s.items) { ensure(24); doc.fontSize(8.5).fillColor(GOLD).text(`[${it.classification}] `, 48, doc.y, { continued: true }).fillColor('#111').text(`${it.text}${it.refs.length ? `  (evidence: ${it.refs.join(', ')})` : ''}`, { width: W }); } doc.moveDown(0.5); }
  }
  doc.addPage().font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Definitions, assumptions & evidence').font('Helvetica').moveDown(0.5);
  for (const d of c.definitions) doc.fontSize(8).fillColor('#111').text(`${d.code} — ${d.name}: ${d.definition} Formula: ${d.formula}`, { width: W }).moveDown(0.2);
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Material assumptions').font('Helvetica'); for (const a of c.assumptions) doc.fontSize(8).text(`• ${a}`, { width: W });
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Validation status').font('Helvetica').fontSize(8).text(`Confidence: ${Object.entries(c.validation.confidence_counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'}. Failing controls: ${c.validation.failing_controls.map((f: any) => `${f.code} ${f.name}`).join('; ') || 'none'}.`, { width: W });
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Evidence references').font('Helvetica').fontSize(7).text(c.evidence_refs.join(' · '), { width: W });
  doc.end();
  return done;
}

export async function renderXlsx(report: any): Promise<Buffer> {
  const c = report.content; const wb = new ExcelJS.Workbook(); wb.creator = 'MIPS Executive OS';
  const meta = wb.addWorksheet('Report');
  meta.addRows([['Title', c.title], ['Tenant', c.tenant], ['Demo data', c.is_demo ? 'YES — synthetic' : 'no'], ['Period', `${c.period.start} → ${c.period.end}`], ['Calculation run', c.data_refresh.calculation_run], ['Data refresh', String(c.data_refresh.calculated_at)], ['Data status', report.data_status], ['Content SHA-256', report.content_sha256], [], ['Assumptions'], ...c.assumptions.map((a: string) => ['', a]), [], ['Evidence'], ...c.evidence_refs.map((e: string) => ['', e])]);
  meta.getColumn(1).width = 22; meta.getColumn(2).width = 110;
  let n = 0;
  for (const s of c.sections as Section[]) {
    if (s.type === 'table') { const ws = wb.addWorksheet(`${++n} ${(s.title ?? 'Table').replace(/[\\/*?:[\]]/g, '')}`.slice(0, 31)); ws.addRow(s.columns).font = { bold: true }; for (const r of s.rows) ws.addRow(r); ws.columns.forEach((col) => { col.width = 22; }); }
    if (s.type === 'statements') { const ws = wb.addWorksheet(`${++n} ${(s.title ?? 'Briefing').replace(/[\\/*?:[\]]/g, '')}`.slice(0, 31)); ws.addRow(['Classification', 'Statement', 'Evidence', 'Owner', 'Deadline']).font = { bold: true }; for (const it of s.items) ws.addRow([it.classification, it.text, it.refs.join(', '), it.owner ?? '', it.deadline ?? '']); ws.getColumn(2).width = 100; }
  }
  const defs = wb.addWorksheet('Definitions'); defs.addRow(['Code', 'Name', 'Definition', 'Formula']).font = { bold: true }; for (const d of c.definitions) defs.addRow([d.code, d.name, d.definition, d.formula]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
