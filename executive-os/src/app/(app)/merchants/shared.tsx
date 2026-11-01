/** Small presentational helpers shared by the payment-economics pages (server components). */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { SEGMENTS, type SegmentCode } from '@/lib/services/segmentation';
import type { AllocationMethod } from '@/lib/engine/economics';

export const ALLOC_LABEL: Record<AllocationMethod, string> = {
  by_revenue: 'By net revenue share', by_transactions: 'By successful transactions', by_gpv: 'By GPV share', none: 'Not allocated',
};
export const ALLOC_METHODS = Object.keys(ALLOC_LABEL) as AllocationMethod[];
export function parseAlloc(v: string | undefined, fallback: AllocationMethod): AllocationMethod {
  return v && (ALLOC_METHODS as string[]).includes(v) ? (v as AllocationMethod) : fallback;
}

export function policyLabel(policy: string, note?: string | null): string {
  const p = policy === 'principal_gross'
    ? 'Principal (gross): recognised revenue = MDR + SaaS; wholesale is a cost of sales'
    : 'Agent (net): recognised revenue = MDR − wholesale + SaaS';
  return note ? `${p}. ${note}` : p;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn' }) {
  const t = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : 'text-fg';
  return (
    <div className="card p-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tracking-tight num ${t}`}>{value}</div>
      {sub && <div className="mt-0.5 text-2xs text-muted">{sub}</div>}
    </div>
  );
}

export function SegmentBadge({ segment }: { segment: SegmentCode }) {
  const s = SEGMENTS[segment];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Hidden inputs that carry the current query string through a GET form (except the overridden keys). */
export function KeepParams({ sp, except }: { sp: Record<string, string | string[] | undefined>; except: string[] }) {
  return <>{Object.entries(sp).filter(([k, v]) => !except.includes(k) && typeof v === 'string').map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}</>;
}
