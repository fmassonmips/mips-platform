'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/** Period selector bound to the `range` URL parameter (see src/lib/period.ts). */
export function PeriodFilter({ current, months, fyears, allowCompare = true }: { current: string; months: string[]; fyears: number[]; allowCompare?: boolean }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const kind = current.split(':')[0];
  const [mode, setMode] = useState(['m', 'q', 'y', 'fy', 'c'].includes(kind) ? kind : current);
  const [from, setFrom] = useState(current.startsWith('c:') ? current.slice(2).split('..')[0] : '');
  const [to, setTo] = useState(current.startsWith('c:') ? current.slice(2).split('..')[1] : '');
  const go = (range: string, extra: Record<string, string> = {}) => { const p = new URLSearchParams(sp.toString()); p.set('range', range); for (const [k, v] of Object.entries(extra)) p.set(k, v); router.push(`${path}?${p.toString()}`); };
  const quarters = Array.from(new Set(months.map((m) => `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`)));
  const years = Array.from(new Set(months.map((m) => m.slice(0, 4))));
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <select aria-label="Period type" className="input w-auto py-1 text-xs" value={mode} onChange={(e) => { const v = e.target.value; setMode(v); if (v === 'ytd' || v === 'fytd') go(v); }}>
        <option value="m">Month</option><option value="q">Quarter</option><option value="y">Calendar year</option><option value="fy">Fiscal year</option><option value="ytd">Year to date</option><option value="fytd">FY to date</option><option value="c">Custom range</option>
      </select>
      {mode === 'm' && <select aria-label="Month" className="input w-auto py-1 text-xs" value={current.startsWith('m:') ? current.slice(2) : ''} onChange={(e) => go(`m:${e.target.value}`)}><option value="" disabled>Select…</option>{[...months].reverse().map((m) => <option key={m} value={m.slice(0, 7)}>{m.slice(0, 7)}</option>)}</select>}
      {mode === 'q' && <select aria-label="Quarter" className="input w-auto py-1 text-xs" value={current.startsWith('q:') ? current.slice(2) : ''} onChange={(e) => go(`q:${e.target.value}`)}><option value="" disabled>Select…</option>{[...quarters].reverse().map((q) => <option key={q}>{q}</option>)}</select>}
      {mode === 'y' && <select aria-label="Year" className="input w-auto py-1 text-xs" value={current.startsWith('y:') ? current.slice(2) : ''} onChange={(e) => go(`y:${e.target.value}`)}><option value="" disabled>Select…</option>{[...years].reverse().map((y) => <option key={y}>{y}</option>)}</select>}
      {mode === 'fy' && <select aria-label="Fiscal year" className="input w-auto py-1 text-xs" value={current.startsWith('fy:') ? current.slice(3) : ''} onChange={(e) => go(`fy:${e.target.value}`)}><option value="" disabled>Select…</option>{[...fyears].reverse().map((y) => <option key={y} value={y}>FY{y}</option>)}</select>}
      {mode === 'c' && (<>
        <input aria-label="From" type="date" className="input w-auto py-1 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="To" type="date" className="input w-auto py-1 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn py-1 text-xs" disabled={!from || !to || from > to} onClick={() => go(`c:${from}..${to}`)}>Apply</button>
      </>)}
      {allowCompare && (
        <select aria-label="Comparison" className="input w-auto py-1 text-xs" value={sp.get('compare') ?? 'prior'} onChange={(e) => go(current, { compare: e.target.value })}>
          <option value="prior">vs prior period</option><option value="yoy">vs same period last year</option>
        </select>
      )}
    </div>
  );
}
