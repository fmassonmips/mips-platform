'use client';
/**
 * Chart wrappers (Recharts). Values arrive as decimal strings from the server and
 * are converted to numbers ONLY for plotting — never for calculation.
 */
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell, ReferenceLine, AreaChart, Area, ComposedChart } from 'recharts';

export const SERIES = ['#173166', '#b8923d', '#2563c2', '#168052', '#c27803', '#7c3aed', '#c43131', '#0e7490', '#64748b'];
const axis = { fontSize: 11, fill: 'rgb(var(--muted))' };
const plot = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));
function compact(n: number): string { const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(1) + 'bn'; if (a >= 1e6) return (n / 1e6).toFixed(1) + 'm'; if (a >= 1e3) return (n / 1e3).toFixed(0) + 'k'; return n.toFixed(a < 10 ? 2 : 0); }
type Row = Record<string, string | number | null>;
interface SeriesDef { key: string; label: string; color?: string; type?: 'line' | 'bar' | 'area'; stack?: string; yAxis?: 'left' | 'right' }

function TT({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span><span className="num font-medium">{p.value === null ? '—' : unit === '%' ? `${(p.value * 100).toFixed(2)}%` : Number(p.value).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
      ))}
    </div>
  );
}

export function TrendChart({ data, x, series, height = 240, unit, refLine }: { data: Row[]; x: string; series: SeriesDef[]; height?: number; unit?: '%' | 'money' | 'count'; refLine?: number }) {
  const rows = data.map((d) => { const o: Row = { [x]: d[x] }; for (const s of series) o[s.key] = plot(d[s.key] as string); return o; });
  const hasRight = series.some((s) => s.yAxis === 'right');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => (unit === '%' ? `${(v * 100).toFixed(0)}%` : compact(v))} />
        {hasRight && <YAxis yAxisId="right" orientation="right" tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />}
        <Tooltip content={<TT unit={unit} />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
        {refLine !== undefined && <ReferenceLine yAxisId="left" y={refLine} stroke="rgb(var(--neg))" strokeDasharray="4 4" />}
        {series.map((s, i) => {
          const color = s.color ?? SERIES[i % SERIES.length];
          if (s.type === 'bar') return <Bar key={s.key} yAxisId={s.yAxis ?? 'left'} dataKey={s.key} name={s.label} fill={color} stackId={s.stack} radius={s.stack ? 0 : [3, 3, 0, 0]} maxBarSize={36} />;
          if (s.type === 'area') return <Area key={s.key} yAxisId={s.yAxis ?? 'left'} dataKey={s.key} name={s.label} stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} stackId={s.stack} />;
          return <Line key={s.key} yAxisId={s.yAxis ?? 'left'} dataKey={s.key} name={s.label} stroke={color} strokeWidth={2} dot={false} connectNulls />;
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ values, color = '#b8923d', height = 32 }: { values: (string | null)[]; color?: string; height?: number }) {
  const rows = values.map((v, i) => ({ i, v: plot(v) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Area dataKey="v" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, labelKey, valueKey, height, color = '#173166', unit }: { data: Row[]; labelKey: string; valueKey: string; height?: number; color?: string; unit?: '%' }) {
  const rows = data.map((d) => ({ label: d[labelKey], v: plot(d[valueKey] as string) }));
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, rows.length * 26)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => (unit === '%' ? `${(v * 100).toFixed(0)}%` : compact(v))} />
        <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={150} />
        <Tooltip content={<TT unit={unit} />} />
        <Bar dataKey="v" name="Value" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {rows.map((r, i) => <Cell key={i} fill={(r.v ?? 0) < 0 ? '#c43131' : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Waterfall: steps are deltas; first/last can be totals. */
export function Waterfall({ steps, height = 260 }: { steps: { label: string; value: string; total?: boolean }[]; height?: number }) {
  let run = 0;
  const rows = steps.map((s) => {
    const v = Number(s.value);
    if (s.total) { run = v; return { label: s.label, base: 0, up: v >= 0 ? v : 0, down: v < 0 ? -v : 0, total: true, raw: v }; }
    const start = run; run += v;
    return { label: s.label, base: Math.min(start, run), up: v >= 0 ? v : 0, down: v < 0 ? -v : 0, total: false, raw: v };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => compact(v)} />
        <Tooltip formatter={(_v: any, _n: any, p: any) => [Number(p.payload.raw).toLocaleString('en-US', { maximumFractionDigits: 0 }), 'Δ']} />
        <Bar dataKey="base" stackId="w" fill="transparent" />
        <Bar dataKey="up" stackId="w" maxBarSize={44}>{rows.map((r, i) => <Cell key={i} fill={r.total ? '#173166' : '#168052'} />)}</Bar>
        <Bar dataKey="down" stackId="w" maxBarSize={44}>{rows.map((r, i) => <Cell key={i} fill={r.total ? '#173166' : '#c43131'} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
