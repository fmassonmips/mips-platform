'use client';
/**
 * Reusable data table (TanStack Table): sorting, global filter, pagination,
 * CSV export of the filtered rows, optional row links (drill-down).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, flexRender, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { Download, Search } from 'lucide-react';

export interface Col { key: string; label: string; align?: 'left' | 'right'; kind?: 'text' | 'money' | 'number' | 'pct' | 'bps' | 'date' | 'badge'; ccy?: string; dp?: number; width?: number; href?: string }
type Row = Record<string, any>;

function fmt(v: any, c: Col): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  switch (c.kind) {
    case 'money': return n.toLocaleString('en-US', { minimumFractionDigits: c.dp ?? 0, maximumFractionDigits: c.dp ?? 0 });
    case 'number': return n.toLocaleString('en-US', { maximumFractionDigits: c.dp ?? 0, minimumFractionDigits: c.dp ?? 0 });
    case 'pct': return `${(n * 100).toFixed(c.dp ?? 1)}%`;
    case 'bps': return `${n.toFixed(c.dp ?? 1)}`;
    case 'date': return String(v).slice(0, 10);
    default: return String(v);
  }
}
const sortNum = (a: any, b: any) => (Number(a ?? -Infinity) - Number(b ?? -Infinity));
const BADGE: Record<string, string> = { VERIFIED: 'text-pos', DISPUTED: 'text-neg', PENDING: 'text-warn', ESTIMATED: 'text-info', pass: 'text-pos', fail: 'text-neg', warn: 'text-warn' };

export function DataTable({ rows, columns, filename = 'export', pageSize = 25, rowHref, dense, footer, searchable = true }: { rows: Row[]; columns: Col[]; filename?: string; pageSize?: number; rowHref?: string; dense?: boolean; footer?: Row; searchable?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');
  const defs = useMemo<ColumnDef<Row>[]>(() => columns.map((c) => ({
    id: c.key, accessorFn: (r: Row) => r[c.key], header: c.label,
    sortingFn: ['money', 'number', 'pct', 'bps'].includes(c.kind ?? '') ? ((a: any, b: any) => sortNum(a.getValue(c.key), b.getValue(c.key))) : 'alphanumeric',
    cell: (info: any) => {
      const v = info.getValue(); const text = fmt(v, c);
      const neg = ['money', 'number', 'pct', 'bps'].includes(c.kind ?? '') && Number(v) < 0;
      const content = c.kind === 'badge' ? <span className={`text-2xs font-semibold uppercase ${BADGE[v] ?? 'text-muted'}`}>{String(v ?? '—').replace(/_/g, ' ')}</span> : <span className={neg ? 'text-neg' : ''}>{text}</span>;
      const href = c.href ? c.href.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(info.row.original[k] ?? '')) : null;
      return href ? <Link className="link" href={href}>{content}</Link> : content;
    },
  })), [columns]);
  const table = useReactTable({ data: rows, columns: defs, state: { sorting, globalFilter: filter }, onSortingChange: setSorting, onGlobalFilterChange: setFilter, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } });

  const exportCsv = () => {
    const esc = (s: any) => { const t = s === null || s === undefined ? '' : String(s); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    for (const r of table.getFilteredRowModel().rows) lines.push(columns.map((c) => esc(r.original[c.key])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const pad = dense ? 'py-1' : '';
  return (
    <div>
      {searchable && (
        <div className="no-print flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="relative w-64 max-w-full"><Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted" /><input className="input pl-7 py-1 text-xs" placeholder="Filter rows…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <div className="flex items-center gap-2 text-xs text-muted"><span>{table.getFilteredRowModel().rows.length} rows</span><button type="button" onClick={exportCsv} className="btn py-1 text-xs"><Download className="h-3.5 w-3.5" />CSV</button></div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>{table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>{hg.headers.map((h) => { const c = columns.find((x) => x.key === h.id)!; const s = h.column.getIsSorted(); return (
              <th key={h.id} className={`th cursor-pointer select-none ${c.align === 'right' || ['money', 'number', 'pct', 'bps'].includes(c.kind ?? '') ? 'text-right' : ''}`} onClick={h.column.getToggleSortingHandler()} style={c.width ? { width: c.width } : undefined}>
                {flexRender(h.column.columnDef.header, h.getContext())}{s === 'asc' ? ' ▲' : s === 'desc' ? ' ▼' : ''}
              </th>); })}</tr>
          ))}</thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2">
                {r.getVisibleCells().map((cell) => { const c = columns.find((x) => x.key === cell.column.id)!; const right = c.align === 'right' || ['money', 'number', 'pct', 'bps'].includes(c.kind ?? ''); return (
                  <td key={cell.id} className={`td ${pad} ${right ? 'num text-right' : ''}`}>
                    {rowHref && c === columns[0] ? <Link className="link" href={rowHref.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(r.original[k] ?? ''))}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Link> : flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>); })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && <tr><td className="td text-center text-muted" colSpan={columns.length}>No rows</td></tr>}
          </tbody>
          {footer && <tfoot><tr className="bg-surface-2 font-semibold">{columns.map((c) => { const right = ['money', 'number', 'pct', 'bps'].includes(c.kind ?? ''); return <td key={c.key} className={`td ${right ? 'num text-right' : ''}`}>{footer[c.key] === undefined ? '' : fmt(footer[c.key], c)}</td>; })}</tr></tfoot>}
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="no-print flex items-center justify-end gap-2 px-3 py-2 text-xs text-muted">
          <button className="btn py-1 text-xs" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Prev</button>
          <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
          <button className="btn py-1 text-xs" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
        </div>
      )}
    </div>
  );
}
