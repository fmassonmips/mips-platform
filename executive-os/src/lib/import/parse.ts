/** File parsing for imports: RFC 4180 CSV (auto delimiter) and Excel (.xlsx). */
import ExcelJS from 'exceljs';

export interface ParsedFile { columns: string[]; rows: string[][]; sheet?: string }

export function parseCsv(text: string): ParsedFile {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = []; let row: string[] = []; let field = ''; let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
      continue;
    }
    if (c === '"' && field === '') { inQ = true; continue; }
    if (c === delim) { row.push(field); field = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some((x) => x !== '')) out.push(row); row = []; continue; }
    field += c;
  }
  if (inQ) throw new Error('Malformed CSV: unterminated quoted field');
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) out.push(row); }
  if (!out.length) throw new Error('The file is empty');
  const columns = out[0].map((h) => h.trim());
  if (new Set(columns).size !== columns.length) throw new Error('Duplicate column headers in file');
  return { columns, rows: out.slice(1).map((r) => columns.map((_, i) => (r[i] ?? '').trim())) };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 19 : 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText((v as any).result);
    if ('text' in v) return String((v as any).text);
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('');
  }
  return String(v);
}

export async function parseXlsx(buf: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no worksheet');
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => { const vals = (r.values as ExcelJS.CellValue[]).slice(1).map(cellText); rows.push(vals.map((x) => x.trim())); });
  if (!rows.length) throw new Error('The worksheet is empty');
  const columns = rows[0];
  return { columns, rows: rows.slice(1).map((r) => columns.map((_, i) => r[i] ?? '')), sheet: ws.name };
}

export async function parseFile(buf: Buffer, filename: string): Promise<ParsedFile> {
  if (/\.xlsx$/i.test(filename)) return parseXlsx(buf);
  if (/\.(csv|txt|tsv)$/i.test(filename)) return parseCsv(buf.toString('utf8'));
  throw new Error('Unsupported file type: upload CSV (.csv/.txt/.tsv) or Excel (.xlsx)');
}
