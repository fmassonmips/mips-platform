import type { ReactNode } from 'react';
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-2xs font-semibold uppercase tracking-widest text-gold">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>{actions}</div>
      {children}
    </div>
  );
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center"><div className="text-sm font-medium">{title}</div>{children && <div className="mt-1 text-sm text-muted">{children}</div>}</div>;
}
export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'neg' | 'pos'; title: string; children?: ReactNode }) {
  const c = { info: 'border-info/40 bg-info/5', warn: 'border-warn/40 bg-warn/5', neg: 'border-neg/40 bg-neg/5', pos: 'border-pos/40 bg-pos/5' }[tone];
  const t = { info: 'text-info', warn: 'text-warn', neg: 'text-neg', pos: 'text-pos' }[tone];
  return <div className={`rounded-lg border px-4 py-3 ${c}`}><div className={`text-sm font-semibold ${t}`}>{title}</div>{children && <div className="mt-1 text-sm text-fg/90">{children}</div>}</div>;
}
