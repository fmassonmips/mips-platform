import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

const tones = {
  neutral: 'bg-surface-2 text-muted border-border',
  pos: 'bg-pos/10 text-pos border-pos/30',
  neg: 'bg-neg/10 text-neg border-neg/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  info: 'bg-info/10 text-info border-info/30',
  gold: 'bg-gold-soft text-gold border-gold/40',
  navy: 'bg-navy-2/10 text-navy-2 border-navy-2/30 dark:text-info',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide', tones[tone], className)}>{children}</span>;
}

const CONF: Record<string, { tone: Tone; help: string }> = {
  VERIFIED: { tone: 'pos', help: 'Reconciled against approved evidence (management verification — not an external audit opinion)' },
  PENDING: { tone: 'warn', help: 'Awaiting verification (open period or verification not yet recorded)' },
  DISPUTED: { tone: 'neg', help: 'Conflicting evidence: at least one control failed for this KPI’s sources' },
  ESTIMATED: { tone: 'info', help: 'Based on documented assumptions (e.g. processing cost model)' },
};
export function ConfidenceBadge({ value, note }: { value: string; note?: string | null }) {
  const c = CONF[value] ?? CONF.PENDING;
  return <Badge tone={c.tone} title={note ? `${c.help}\n${note}` : c.help}>{value}</Badge>;
}

const STATUS_TONE: Record<string, Tone> = {
  approved: 'pos', paid: 'pos', done: 'pos', completed: 'pos', implemented: 'pos', on_track: 'pos', committed: 'pos', confirmed: 'pos', resolved: 'pos', active: 'pos', locked: 'navy', closed: 'navy', verified: 'pos', pass: 'pos',
  draft: 'neutral', open: 'info', received: 'info', proposed: 'info', submitted: 'info', uploaded: 'info', validated: 'info', in_progress: 'info', not_started: 'neutral', scheduled: 'info', shortlisted: 'gold', selected: 'gold', soft_closed: 'warn', in_review: 'warn',
  at_risk: 'warn', on_hold: 'warn', pending: 'warn', partially_paid: 'warn', investigating: 'warn', warn: 'warn', reminded: 'warn', promised: 'info',
  pending_approval: 'warn', reminder_drafted: 'info', reminder_sent: 'pos', amount_difference: 'warn', duplicate: 'warn', unmatched: 'neg',
  blocked: 'neg', rejected: 'neg', failed: 'neg', overdue: 'neg', disputed: 'neg', escalated: 'neg', churned: 'neg', cancelled: 'neutral', fail: 'neg', superseded: 'neutral', archived: 'neutral', legal: 'neg',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}
export function DemoBadge() { return <Badge tone="gold" title="Synthetic demonstration data — not actual MIPS results">DEMO</Badge>; }
