import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/badge';
import { contractConstraint } from '@/lib/services/segmentation';
import { todayISO } from '@/lib/period';

export function MerchantTabs({ id, active, range }: { id: string; active: 'overview' | 'transactions' | 'contracts'; range: string }) {
  const r = `?range=${encodeURIComponent(range)}`;
  const tabs = [
    { k: 'overview', label: 'Economics & simulation', href: `/merchants/${id}${r}` },
    { k: 'transactions', label: 'Transactions drill-down', href: `/merchants/${id}/transactions${r}` },
    { k: 'contracts', label: 'Pricing agreements & fee schedules', href: `/merchants/${id}/contracts${r}` },
  ] as const;
  return (
    <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-border">
      <Link href={`/merchants${r}`} className="px-3 py-2 text-sm text-muted hover:text-fg">← All merchants</Link>
      {tabs.map((t) => <Link key={t.k} href={t.href} className={`-mb-px border-b-2 px-3 py-2 text-sm ${active === t.k ? 'border-gold font-semibold text-fg' : 'border-transparent text-muted hover:text-fg'}`}>{t.label}</Link>)}
    </div>
  );
}

export function MerchantBadges({ m }: { m: any }) {
  const constraint = contractConstraint({ priceLockedUntil: m.price_locked_until, contractNotes: m.contract_notes }, todayISO());
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={m.status} />
      <Badge>{String(m.segment).replace('_', ' ')}</Badge>
      {m.vertical && <Badge>{m.vertical}</Badge>}
      {m.group_name && <Badge tone="navy">{m.group_name}</Badge>}
      <Badge title="Commercial importance (1–5)">importance {m.commercial_importance}/5</Badge>
      <Badge tone={m.churn_risk >= 4 ? 'neg' : 'neutral'} title="Churn risk (1–5)">churn risk {m.churn_risk}/5</Badge>
      {constraint && <Badge tone="warn" title={constraint}>Contractually constrained</Badge>}
    </div>
  );
}
