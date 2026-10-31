import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { dec } from '@/lib/money';
import { fmtValue, fmtPct } from '@/lib/format';
import { ConfidenceBadge } from './badge';
import { Sparkline } from './charts';

export interface KpiCardData { code: string; name: string; unit: string; direction: string; value: string | null; previous: string | null; confidence: string; statusNote?: string | null; currency?: string | null; series?: (string | null)[]; resultId?: string; source?: string }

/** Value, trend, period comparison, status and source for one KPI. */
export function KpiCard({ k, range, compareLabel }: { k: KpiCardData; range: string; compareLabel: string }) {
  let delta: string | null = null; let deltaAbs: string | null = null; let good: boolean | null = null;
  if (k.value !== null && k.previous !== null) {
    const v = dec(k.value), p = dec(k.previous);
    deltaAbs = v.minus(p).toString();
    if (!p.isZero()) delta = v.minus(p).div(p.abs()).toString();
    const up = v.gt(p);
    good = k.direction === 'neutral' || v.eq(p) ? null : (k.direction === 'up') === up;
  }
  const isRatio = ['percent', 'bps', 'days', 'ratio'].includes(k.unit);
  const Icon = good === null ? Minus : (deltaAbs && dec(deltaAbs).gt(0)) ? ArrowUpRight : ArrowDownRight;
  const tone = good === null ? 'text-muted' : good ? 'text-pos' : 'text-neg';
  return (
    <div className="card flex flex-col justify-between p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted">{k.name}</div>
        <ConfidenceBadge value={k.confidence} note={k.statusNote} />
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight num">{fmtValue(k.value, k.unit, k.currency ?? 'MUR')}</div>
      <div className={`mt-0.5 flex items-center gap-1 text-xs ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        {deltaAbs === null ? <span className="text-muted">no comparison</span> : isRatio ? <span className="num">{k.unit === 'percent' ? `${dec(deltaAbs).times(100).toFixed(1)} pp` : `${dec(deltaAbs).toFixed(1)}${k.unit === 'bps' ? ' bps' : k.unit === 'days' ? ' d' : ''}`}</span> : <span className="num">{delta ? fmtPct(delta) : fmtValue(deltaAbs, k.unit, k.currency ?? 'MUR')}</span>}
        <span className="text-muted">{compareLabel}</span>
      </div>
      {k.series && k.series.length > 1 && <div className="mt-2 h-8"><Sparkline values={k.series} color={good === false ? '#c43131' : '#b8923d'} /></div>}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-2xs text-muted">
        <span className="truncate" title={k.source}>{k.code}</span>
        <Link className="link" href={`/proof/kpi/${encodeURIComponent(k.code)}?range=${encodeURIComponent(range)}`}>Source & proof →</Link>
      </div>
    </div>
  );
}
