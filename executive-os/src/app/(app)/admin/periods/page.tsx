import { tx, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { requireAny, periodTransition, type PeriodOp } from '@/lib/services/admin';
import { monthLabel } from '@/lib/format';
import { PageHeader, Callout } from '@/components/ui/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Flash } from '../../strategy/_ui';
import { SubmitButton } from '../../strategy/_client';
import { periodAction } from '../actions';

export const dynamic = 'force-dynamic';

const OPS: { op: PeriodOp; label: string; cls: string; reason?: boolean }[] = [
  { op: 'soft_close', label: 'Soft close', cls: 'btn' },
  { op: 'lock', label: 'Lock', cls: 'btn-primary' },
  { op: 'reopen', label: 'Re-open', cls: 'btn', reason: true },
  { op: 'unlock', label: 'Unlock', cls: 'btn-danger', reason: true },
];

export default async function PeriodsPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAny(['finance.lock_period', 'admin.settings']);
  const sp = await searchParams;
  const canLock = auth.permissions.has('finance.lock_period');
  const rows = await tx(auth, (t) => q<{ period: string; status: string; locked_by_name: string | null; locked_at: string | null; gl: number; last_action: string | null; last_at: string | null; last_by: string | null; last_reason: string | null }>(t,
    `SELECT p.period::text, p.status, u.name AS locked_by_name, p.locked_at::text,
       (SELECT count(*)::int FROM gl_entries g WHERE g.period = p.period) AS gl,
       la.action AS last_action, la.created_at::text AS last_at, la.actor AS last_by, la.reason AS last_reason
     FROM financial_periods p LEFT JOIN users u ON u.id = p.locked_by
     LEFT JOIN LATERAL (SELECT a.action, a.created_at, coalesce(x.name, a.actor_label) AS actor, a.payload->>'reason' AS reason FROM audit_events a LEFT JOIN users x ON x.id = a.actor_user_id
                        WHERE a.entity_type = 'financial_period' AND a.entity_id = p.period::text ORDER BY a.id DESC LIMIT 1) la ON true
     ORDER BY p.period DESC`));
  const rt = '/admin/periods';
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Financial periods" subtitle={<>Close workflow: open → soft-closed (review) → locked. Postings into a locked period are rejected by the database; KPIs for fully locked periods can reach VERIFIED. Unlocking a locked period or re-opening a soft-closed one requires a reason and is audited. {canLock ? '' : 'You can view periods; changing them requires finance.lock_period.'}</>} />
      <Flash sp={sp} />
      <div className="mb-4"><Callout tone="info" title={`${rows.filter((r) => r.status === 'locked').length} locked · ${rows.filter((r) => r.status === 'soft_closed').length} soft-closed · ${rows.filter((r) => r.status === 'open').length} open`} /></div>
      <Card>
        <CardHeader title="Periods" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Period</th><th className="th">Status</th><th className="th">Locked by / at</th><th className="th text-right">GL entries</th><th className="th">Last change</th>{canLock && <th className="th no-print">Actions</th>}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const period = r.period.slice(0, 10);
                return (
                  <tr key={period} className="align-top">
                    <td className="td font-medium">{monthLabel(period)} <span className="text-xs text-muted">{period.slice(0, 7)}</span></td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td text-xs">{r.locked_by_name ? <>{r.locked_by_name}<div className="text-muted">{r.locked_at?.slice(0, 16).replace('T', ' ')}</div></> : '—'}</td>
                    <td className="td num text-right text-xs">{r.gl}</td>
                    <td className="td text-xs">{r.last_action ? <>{r.last_action.replace('finance.period_', '').replace('_', ' ')} by {r.last_by ?? 'system'} · {r.last_at?.slice(0, 16).replace('T', ' ')}{r.last_reason && <div className="text-muted">“{r.last_reason}”</div>}</> : <span className="text-muted">—</span>}</td>
                    {canLock && (
                      <td className="td no-print">
                        <div className="flex flex-wrap items-start gap-2">
                          {OPS.filter((o) => periodTransition(r.status, o.op)).map((o) => (
                            <form key={o.op} action={periodAction} className="flex items-center gap-1">
                              <input type="hidden" name="period" value={period} /><input type="hidden" name="op" value={o.op} /><input type="hidden" name="returnTo" value={rt} />
                              {o.reason && <input name="reason" className="input w-56 py-1 text-xs" placeholder="Reason (required, ≥ 10 chars)" required minLength={10} maxLength={500} aria-label={`Reason to ${o.label.toLowerCase()} ${period.slice(0, 7)}`} />}
                              <SubmitButton className={`${o.cls} py-1 text-xs`} pendingLabel="…" confirm={o.op === 'lock' ? `Lock ${period.slice(0, 7)}? Postings into it will be rejected.` : undefined}>{o.label}</SubmitButton>
                            </form>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
