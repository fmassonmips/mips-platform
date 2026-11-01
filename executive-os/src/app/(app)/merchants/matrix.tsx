'use client';
/**
 * Merchant profitability matrix: x = volume (GPV, log scale) or net revenue, y = contribution
 * margin in bps of GPV. Every point links to the merchant detail page. Values arrive as
 * decimal strings and are converted to numbers ONLY for plotting.
 */
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';

export const SEGMENT_COLORS: Record<string, string> = { protect_grow: '#168052', reprice: '#c27803', optimise_routing: '#2563c2', monitor: '#64748b', exit_restructure: '#c43131' };
const LABELS: Record<string, string> = { protect_grow: 'Protect & grow', reprice: 'Reprice', optimise_routing: 'Optimise routing', monitor: 'Monitor', exit_restructure: 'Exit or restructure' };

export interface MatrixPoint { id: string; name: string; segment: string; x: string; y: string; size: string; xLabel: string; yLabel: string; flags: string }

function compact(n: number): string { const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(1) + 'bn'; if (a >= 1e6) return (n / 1e6).toFixed(1) + 'm'; if (a >= 1e3) return (n / 1e3).toFixed(0) + 'k'; return n.toFixed(0); }

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-card">
      <div className="font-semibold">{p.name}</div>
      <div className="text-muted">{LABELS[p.segment]}</div>
      <div className="num">{p.xLabel}</div><div className="num">{p.yLabel}</div>
      {p.flags && <div className="mt-1 max-w-[260px] whitespace-normal text-warn">{p.flags}</div>}
      <div className="mt-1 text-info">Click to open merchant →</div>
    </div>
  );
}

export function ProfitabilityMatrix({ points, xRef, yRef, xMode, range, xTitle }: { points: MatrixPoint[]; xRef: string | null; yRef: string | null; xMode: 'gpv' | 'net'; range: string; xTitle: string }) {
  const router = useRouter();
  const data = points.map((p) => ({ ...p, xv: Number(p.x), yv: Number(p.y), zv: Math.max(1, Number(p.size)) })).filter((p) => (xMode === 'gpv' ? p.xv > 0 : true));
  const segs = Object.keys(LABELS).filter((s) => data.some((d) => d.segment === s));
  const href = (id: string) => `/merchants/${id}?range=${encodeURIComponent(range)}`;
  // Each point is a real link (works without JS and with keyboard); client navigation when JS is available.
  const Dot = (props: any) => {
    const p = props.payload ?? props; const r = Math.max(4, Math.sqrt((props.size ?? 64) / Math.PI));
    return (
      <a href={href(p.id)} onClick={(e) => { e.preventDefault(); router.push(href(p.id)); }} aria-label={`${p.name} — open merchant`}>
        <circle cx={props.cx} cy={props.cy} r={r} fill={props.fill} fillOpacity={0.75} stroke={props.fill} style={{ cursor: 'pointer' }} />
      </a>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 4 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
        <XAxis type="number" dataKey="xv" name={xTitle} scale={xMode === 'gpv' ? 'log' : 'auto'} domain={xMode === 'gpv' ? ['auto', 'auto'] : ['dataMin', 'dataMax']} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} tickFormatter={compact}
          label={{ value: xTitle + (xMode === 'gpv' ? ' (log scale)' : ''), position: 'insideBottom', offset: -12, fontSize: 11, fill: 'rgb(var(--muted))' }} />
        <YAxis type="number" dataKey="yv" name="Contribution margin" unit=" bps" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} width={70} />
        <ZAxis type="number" dataKey="zv" range={[40, 400]} />
        <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3' }} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        {xRef !== null && <ReferenceLine x={Number(xRef)} stroke="rgb(var(--muted))" strokeDasharray="4 4" label={{ value: 'median volume', fontSize: 10, fill: 'rgb(var(--muted))', position: 'insideBottomLeft' }} />}
        {yRef !== null && <ReferenceLine y={Number(yRef)} stroke="#b8923d" strokeDasharray="4 4" label={{ value: `portfolio ${Number(yRef).toFixed(0)} bps`, fontSize: 10, fill: '#b8923d', position: 'insideTopRight' }} />}
        <ReferenceLine y={0} stroke="#c43131" />
        {segs.map((sg) => (
          <Scatter key={sg} name={LABELS[sg]} data={data.filter((d) => d.segment === sg)} fill={SEGMENT_COLORS[sg]} shape={Dot} isAnimationActive={false} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
