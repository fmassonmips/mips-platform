import Link from 'next/link';
import { dec } from '@/lib/money';
import { fmtNumber, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGES = [
  { href: '/financial-performance', label: 'Overview' },
  { href: '/pnl', label: 'Profit & Loss' },
  { href: '/revenue', label: 'Revenue' },
  { href: '/costs', label: 'Costs' },
  { href: '/budget', label: 'Budget & Forecast' },
];

/** Cross-links between the finance modules, preserving the selected period. */
export function FinanceNav({ current, range }: { current: string; range?: string }) {
  return (
    <nav aria-label="Finance modules" className="no-print -mt-2 mb-4 flex flex-wrap gap-1 border-b border-border text-sm">
      {PAGES.map((p) => (
        <Link key={p.href} href={range ? `${p.href}?range=${encodeURIComponent(range)}` : p.href}
          className={cn('-mb-px border-b-2 px-3 py-1.5', current === p.href ? 'border-gold font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>{p.label}</Link>
      ))}
    </nav>
  );
}

/** Amount (base currency, no symbol) with negative colouring. */
export function Amt({ v, dp = 0, className }: { v: string | null | undefined; dp?: number; className?: string }) {
  if (v === null || v === undefined) return <span className={cn('text-muted', className)}>—</span>;
  return <span className={cn('num', dec(v).lt(0) && 'text-neg', className)}>{fmtNumber(v, dp)}</span>;
}

/** Signed variance with favourable/adverse colouring. */
export function VarAmt({ v, favourable, pct, dp = 0 }: { v: string | null | undefined; favourable: boolean | null; pct?: boolean; dp?: number }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  const d = dec(v);
  const txt = pct ? fmtPct(v, 1) : fmtNumber(v, dp);
  return <span className={cn('num', favourable === true && 'text-pos', favourable === false && 'text-neg')}>{d.gt(0) ? '+' : ''}{txt}</span>;
}

/** Percentage-point delta for margins. */
export function PpDelta({ v, favourable }: { v: string | null | undefined; favourable: boolean | null }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  const pp = dec(v).times(100);
  return <span className={cn('num', favourable === true && 'text-pos', favourable === false && 'text-neg')}>{pp.gt(0) ? '+' : ''}{pp.toDecimalPlaces(1).toFixed(1)} pp</span>;
}

export function Provenance({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-2xs leading-relaxed text-muted">{children}</p>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'pos' | 'neg' | 'warn' }) {
  return (
    <div className="card p-3.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tracking-tight num', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg', tone === 'warn' && 'text-warn')}>{value}</div>
      {sub && <div className="mt-0.5 text-2xs text-muted">{sub}</div>}
    </div>
  );
}
