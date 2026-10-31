import Link from 'next/link';
import { pageContext, tx, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { HBarChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { todayISO } from '@/lib/period';
import { daysBetween } from '@/lib/dates';
import { fmtMoney, fmtNumber, fmtPct } from '@/lib/format';
import { dec, sum, safeDiv } from '@/lib/money';
import { AGING_BUCKETS, BUCKET_LABELS, bucketFor, agingSummary, dso, type AgingBucket } from '@/lib/engine/aging';
import { concentration } from '@/lib/engine/bridge';
import { Flash, ReturnTo, currentUrl, Provenance } from '../cash-flow/_components/flash';
import { approveReminderAction, rejectReminderAction, markReminderSentAction } from './actions';

export const dynamic = 'force-dynamic';

interface InvRow { id: string; number: string; merchant_id: string; customer: string; customer_code: string; issue_date: string; due_date: string; currency: string; amount: string; fx: string; outstanding_base: string; status: string; disputed: boolean; dispute_reason: string | null; collection_status: string; promise_date: string | null; description: string | null; last_event: string | null }

export default async function ReceivablesPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'finance.view');
  const base = auth.baseCurrency;
  const today = todayISO();
  const asOf = period.end < today ? period.end : today;
  const data = await tx(auth, async (t) => {
    const inv = await q<InvRow>(t, `SELECT ci.id, ci.number, ci.merchant_id, m.name AS customer, m.code AS customer_code, ci.issue_date::text, ci.due_date::text, ci.currency, ci.amount::text, ci.fx_rate_to_base::text AS fx,
        ((ci.amount - CASE WHEN ci.paid_date IS NOT NULL AND ci.paid_date <= $1 THEN ci.amount_paid ELSE 0 END) * ci.fx_rate_to_base)::text AS outstanding_base,
        ci.status, ci.disputed, ci.dispute_reason, ci.collection_status, ci.promise_date::text, ci.description,
        (SELECT max(e.created_at)::date::text FROM collection_events e WHERE e.invoice_id = ci.id) AS last_event
      FROM customer_invoices ci JOIN merchants m ON m.id = ci.merchant_id
      WHERE ci.status <> 'void' AND ci.issue_date <= $1 AND (ci.paid_date IS NULL OR ci.paid_date > $1 OR ci.amount_paid < ci.amount)
        AND (ci.amount - CASE WHEN ci.paid_date IS NOT NULL AND ci.paid_date <= $1 THEN ci.amount_paid ELSE 0 END) > 0
      ORDER BY ci.due_date`, [asOf]);
    const dsoIn = await one<{ closing: string; credit_sales: string }>(t, `SELECT
        coalesce(sum((amount - CASE WHEN paid_date IS NOT NULL AND paid_date <= $2 THEN amount_paid ELSE 0 END) * fx_rate_to_base)
          FILTER (WHERE issue_date <= $2 AND status <> 'void' AND (paid_date IS NULL OR paid_date > $2 OR amount_paid < amount)),0)::text AS closing,
        coalesce(sum(amount * fx_rate_to_base) FILTER (WHERE issue_date BETWEEN $1 AND $2 AND status <> 'void'),0)::text AS credit_sales
      FROM customer_invoices`, [period.start, asOf]);
    const events = await q<any>(t, `SELECT e.id, e.invoice_id, ci.number, m.name AS customer, e.kind, e.status, e.note, e.message_draft, e.created_at::text, cu.name AS created_by_name, au.name AS approved_by_name, e.created_by
      FROM collection_events e JOIN customer_invoices ci ON ci.id = e.invoice_id JOIN merchants m ON m.id = ci.merchant_id
      LEFT JOIN users cu ON cu.id = e.created_by LEFT JOIN users au ON au.id = e.approved_by ORDER BY e.created_at DESC LIMIT 300`);
    const sent = await q<{ note: string }>(t, `SELECT note FROM collection_events WHERE kind = 'reminder_sent'`);
    const paidInPeriod = await one<{ v: string; n: string }>(t, `SELECT coalesce(sum(amount_paid * fx_rate_to_base),0)::text AS v, count(*)::text AS n FROM customer_invoices WHERE paid_date BETWEEN $1 AND $2`, [period.start, asOf]);
    return { inv, dsoIn, events, sent, paidInPeriod };
  });

  const rows = data.inv.map((i) => ({ ...i, days_overdue: Math.max(0, daysBetween(i.due_date, asOf)), bucket: bucketFor(i.due_date, asOf) as AgingBucket }));
  const aging = agingSummary(rows.map((r) => ({ dueDate: r.due_date, outstanding: r.outstanding_base })), asOf);
  const total = sum(rows.map((r) => r.outstanding_base));
  const overdue = total.minus(aging.current);
  const disputed = rows.filter((r) => r.disputed);
  const days = daysBetween(period.start, asOf) + 1;
  const dsoV = dso(data.dsoIn?.closing ?? '0', data.dsoIn?.credit_sales ?? '0', days);
  const byCust = new Map<string, { id: string; customer: string; code: string; total: ReturnType<typeof dec>; buckets: Record<AgingBucket, ReturnType<typeof dec>>; n: number; disputed: number; maxDays: number }>();
  for (const r of rows) {
    const c = byCust.get(r.merchant_id) ?? { id: r.merchant_id, customer: r.customer, code: r.customer_code, total: dec(0), buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, dec(0)])) as Record<AgingBucket, ReturnType<typeof dec>>, n: 0, disputed: 0, maxDays: 0 };
    c.total = c.total.plus(r.outstanding_base); c.buckets[r.bucket] = c.buckets[r.bucket].plus(r.outstanding_base); c.n++; if (r.disputed) c.disputed++; c.maxDays = Math.max(c.maxDays, r.days_overdue);
    byCust.set(r.merchant_id, c);
  }
  const customers = [...byCust.values()].sort((a, b) => b.total.cmp(a.total));
  const conc = concentration(customers.map((c) => c.total));
  const sentDrafts = new Set(data.sent.map((s) => /draft ([0-9a-f-]{36})/.exec(s.note ?? '')?.[1]).filter(Boolean));
  const pending = data.events.filter((e) => e.kind === 'reminder_drafted' && e.status === 'pending_approval');
  const toSend = data.events.filter((e) => e.kind === 'reminder_drafted' && e.status === 'approved' && !sentDrafts.has(e.id));
  const history = data.events.filter((e) => e.created_at.slice(0, 10) >= period.start && e.created_at.slice(0, 10) <= period.end);
  const here = currentUrl('/receivables', sp);
  const canApprove = auth.permissions.has('finance.approve');
  const canManage = auth.permissions.has('finance.manage');
  const statusCounts = rows.reduce<Record<string, number>>((a, r) => { a[r.collection_status] = (a[r.collection_status] ?? 0) + 1; return a; }, {});

  return (
    <div>
      <PageHeader eyebrow="Treasury" title={`Accounts receivable & collections — as of ${asOf}`}
        subtitle={<>Customer (merchant) invoices outstanding at {asOf}, in {base}. Aging by days past due (engine aging). Period filter sets the as-of date and the DSO window.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      <Flash sp={sp} />
      <Callout tone="warn" title="No external communication is sent automatically">Reminders are drafted from the collection policies, approved by a different user with finance.approve, and must then be sent by you outside the system. “Mark as sent (manual)” only records that you did so. There is no e-mail integration.</Callout>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Total receivables</div><div className="mt-1 text-lg font-semibold num">{fmtMoney(total.toString(), base)}</div><div className="text-2xs text-muted">{rows.length} invoices · {customers.length} customers</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Overdue</div><div className="mt-1 text-lg font-semibold num text-warn">{fmtMoney(overdue.toString(), base)}</div><div className="text-2xs text-muted">{fmtPct(safeDiv(overdue, total)?.toString() ?? null)} of AR</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Over 90 days</div><div className="mt-1 text-lg font-semibold num text-neg">{fmtMoney(aging.over_90.toString(), base)}</div><div className="text-2xs text-muted">{rows.filter((r) => r.bucket === 'over_90').length} invoices</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Disputed</div><div className="mt-1 text-lg font-semibold num">{fmtMoney(sum(disputed.map((d) => d.outstanding_base)).toString(), base)}</div><div className="text-2xs text-muted">{disputed.length} invoice(s)</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">DSO ({period.label})</div><div className="mt-1 text-lg font-semibold num">{dsoV ? `${fmtNumber(dsoV.toString(), 1)} days` : '—'}</div><div className="text-2xs text-muted"><Link className="link" href={`/proof/kpi/FIN.DSO?range=${encodeURIComponent(period.key)}`}>FIN.DSO source & proof →</Link></div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Collected in period</div><div className="mt-1 text-lg font-semibold num text-pos">{fmtMoney(data.paidInPeriod?.v ?? '0', base)}</div><div className="text-2xs text-muted">{data.paidInPeriod?.n} invoice(s) paid {period.start} → {asOf}</div></CardBody></Card>
      </div>
      <Provenance>DSO = closing AR ({fmtMoney(data.dsoIn?.closing ?? '0', base)}) ÷ credit sales ({fmtMoney(data.dsoIn?.credit_sales ?? '0', base)}) × {days} days (engine aging.dso, same definition as KPI FIN.DSO). Outstanding = amount − amount paid on or before {asOf}, × fx_rate_to_base.</Provenance>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Aging buckets" subtitle={`Days past due at ${asOf}`} />
          <CardBody>
            <table className="w-full text-sm"><tbody>
              {AGING_BUCKETS.map((b) => <tr key={b}><td className="td">{BUCKET_LABELS[b]}</td><td className="td num text-right">{fmtMoney(aging[b].toString(), base)}</td><td className="td num text-right text-muted">{fmtPct(safeDiv(aging[b], total)?.toString() ?? null)}</td></tr>)}
              <tr className="font-semibold"><td className="td">Total</td><td className="td num text-right">{fmtMoney(total.toString(), base)}</td><td className="td" /></tr>
            </tbody></table>
            <div className="mt-3"><HBarChart data={AGING_BUCKETS.map((b) => ({ label: BUCKET_LABELS[b], v: aging[b].toString() }))} labelKey="label" valueKey="v" height={170} color="#b8923d" /></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Customer concentration" subtitle="Share of outstanding receivables" />
          <CardBody>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><div className="text-2xs text-muted">Largest customer</div><div className="font-semibold num">{fmtPct(conc.top1Share?.toString() ?? null)}</div></div>
              <div><div className="text-2xs text-muted">Top 5</div><div className="font-semibold num">{fmtPct(conc.topShare?.toString() ?? null)}</div></div>
              <div><div className="text-2xs text-muted">HHI</div><div className="font-semibold num">{conc.hhi ? fmtNumber(conc.hhi.toString(), 0) : '—'}</div></div>
            </div>
            <div className="mt-3"><HBarChart data={customers.slice(0, 8).map((c) => ({ label: c.customer.replace(' (DEMO)', ''), v: c.total.toString() }))} labelKey="label" valueKey="v" /></div>
            <p className="mt-1 text-2xs text-muted">HHI on outstanding balances (engine bridge.concentration): &lt;1,500 unconcentrated, &gt;2,500 highly concentrated.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Collection status" subtitle="Open invoices by workflow status" />
          <CardBody>
            <table className="w-full text-sm"><tbody>{Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([s, n]) => <tr key={s}><td className="td"><StatusBadge status={s} /></td><td className="td num text-right">{n}</td><td className="td num text-right">{fmtMoney(sum(rows.filter((r) => r.collection_status === s).map((r) => r.outstanding_base)).toString(), base)}</td></tr>)}</tbody></table>
            <p className="mt-2 text-2xs text-muted">Policies (collection_policies) drive which reminder is drafted on the invoice page.</p>
          </CardBody>
        </Card>
      </div>

      <Section title={`Reminder approval queue (${pending.length} awaiting approval · ${toSend.length} approved, to be sent manually)`}>
        <Card>
          {pending.length + toSend.length === 0 ? <CardBody className="text-sm text-muted">No reminder drafts awaiting action. Draft one from an invoice page.</CardBody> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th">Invoice</th><th className="th">Customer</th><th className="th">Policy</th><th className="th">Draft</th><th className="th">Drafted by</th><th className="th">Status</th><th className="th no-print">Action</th></tr></thead>
                <tbody>{[...pending, ...toSend].map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="td"><Link className="link" href={`/receivables/${e.invoice_id}`}>{e.number}</Link></td><td className="td">{e.customer}</td><td className="td">{(e.note ?? '').replace(/\[policy:\w+\]\s*/, '')}</td>
                    <td className="td max-w-[360px] whitespace-pre-wrap">{e.message_draft}</td><td className="td">{e.created_by_name}<div className="text-2xs text-muted">{e.created_at.slice(0, 16)}</div></td>
                    <td className="td"><StatusBadge status={e.status === 'approved' ? 'approved' : 'pending'} />{e.approved_by_name && <div className="text-2xs text-muted">by {e.approved_by_name}</div>}</td>
                    <td className="td no-print">
                      {e.status === 'pending_approval' && (canApprove ? (e.created_by === auth.userId ? <span className="text-2xs text-muted">You drafted this — another approver is required.</span> : <div className="flex flex-col gap-1">
                        <form action={approveReminderAction}><ReturnTo value={here} /><input type="hidden" name="eventId" value={e.id} /><button className="btn-primary py-1 text-xs">Approve</button></form>
                        <form action={rejectReminderAction} className="flex gap-1"><ReturnTo value={here} /><input type="hidden" name="eventId" value={e.id} /><input className="input w-36 py-1 text-xs" name="note" placeholder="Reason" required minLength={3} /><button className="btn py-1 text-xs">Reject</button></form>
                      </div>) : <span className="text-2xs text-muted">Awaiting finance.approve</span>)}
                      {e.status === 'approved' && canManage && <form action={markReminderSentAction} className="flex flex-wrap gap-1"><ReturnTo value={here} /><input type="hidden" name="eventId" value={e.id} /><select name="channel" className="input w-24 py-1 text-xs" aria-label="Channel"><option value="email">E-mail</option><option value="letter">Letter</option><option value="phone">Phone</option><option value="in_person">In person</option><option value="other">Other</option></select><input className="input w-32 py-1 text-xs" name="note" placeholder="Note" /><button className="btn-gold py-1 text-xs">Mark as sent (manual)</button></form>}
                    </td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="mt-1 text-2xs text-muted">The database enforces that the approver of a reminder differs from the user who drafted it (collection_events CHECK).</p>
      </Section>

      <Section title="Customer balances">
        <Card>
          <DataTable filename={`ar-customers-${asOf}`} rows={customers.map((c) => ({ id: c.id, customer: c.customer, invoices: c.n, disputed: c.disputed, max_days: c.maxDays, ...Object.fromEntries(AGING_BUCKETS.map((b) => [b, c.buckets[b].toString()])), total: c.total.toString(), share: safeDiv(c.total, total)?.toString() ?? null }))}
            columns={[{ key: 'customer', label: 'Customer', href: '/merchants/{id}' }, { key: 'invoices', label: 'Invoices', kind: 'number' }, { key: 'disputed', label: 'Disputed', kind: 'number' }, { key: 'max_days', label: 'Max days overdue', kind: 'number' }, ...AGING_BUCKETS.map((b) => ({ key: b, label: BUCKET_LABELS[b], kind: 'money' as const })), { key: 'total', label: 'Total', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct' }]}
            footer={{ customer: 'Total', ...Object.fromEntries(AGING_BUCKETS.map((b) => [b, aging[b].toString()])), total: total.toString() }} />
        </Card>
      </Section>

      <Section title="Overdue accounts">
        <Card>
          <DataTable filename={`ar-overdue-${asOf}`} rows={rows.filter((r) => r.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue).map((r) => ({ ...r, bucket: BUCKET_LABELS[r.bucket as AgingBucket], disputed: r.disputed ? 'disputed' : '' }))} pageSize={15}
            columns={[{ key: 'number', label: 'Invoice', href: '/receivables/{id}' }, { key: 'customer', label: 'Customer' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'days_overdue', label: 'Days overdue', kind: 'number' }, { key: 'bucket', label: 'Bucket' }, { key: 'collection_status', label: 'Collection', kind: 'badge' }, { key: 'promise_date', label: 'Promise', kind: 'date' }, { key: 'disputed', label: 'Dispute' }, { key: 'last_event', label: 'Last action', kind: 'date' }, { key: 'outstanding_base', label: 'Outstanding', kind: 'money' }]} />
        </Card>
      </Section>

      <Section title={`Disputes (${disputed.length})`}>
        <Card>
          {disputed.length === 0 ? <CardBody className="text-sm text-muted">No disputed invoices.</CardBody> :
            <DataTable filename="ar-disputes" searchable={false} rows={disputed} columns={[{ key: 'number', label: 'Invoice', href: '/receivables/{id}' }, { key: 'customer', label: 'Customer' }, { key: 'description', label: 'Description' }, { key: 'dispute_reason', label: 'Reason' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'outstanding_base', label: 'Outstanding', kind: 'money' }]} />}
        </Card>
      </Section>

      <Section title="All outstanding invoices">
        <Card>
          <DataTable filename={`ar-open-${asOf}`} rows={rows.map((r) => ({ ...r, bucket: BUCKET_LABELS[r.bucket as AgingBucket], disputed: r.disputed ? 'disputed' : '' }))}
            columns={[{ key: 'number', label: 'Invoice', href: '/receivables/{id}' }, { key: 'customer', label: 'Customer' }, { key: 'description', label: 'Description' }, { key: 'issue_date', label: 'Issued', kind: 'date' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'bucket', label: 'Bucket' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'collection_status', label: 'Collection', kind: 'badge' }, { key: 'disputed', label: 'Dispute' }, { key: 'currency', label: 'Ccy' }, { key: 'outstanding_base', label: `Outstanding (${base})`, kind: 'money' }]}
            footer={{ number: 'Total', outstanding_base: total.toString() }} />
        </Card>
      </Section>

      <Section title={`Collection history — ${period.label}`}>
        <Card>
          <DataTable filename="collection-history" pageSize={15} rows={history.map((e) => ({ ...e, at: e.created_at.slice(0, 16), note: (e.note ?? '').replace(/\[policy:\w+\]\s*/, '') }))}
            columns={[{ key: 'at', label: 'When' }, { key: 'number', label: 'Invoice', href: '/receivables/{invoice_id}' }, { key: 'customer', label: 'Customer' }, { key: 'kind', label: 'Event', kind: 'badge' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'note', label: 'Note' }, { key: 'created_by_name', label: 'By' }, { key: 'approved_by_name', label: 'Approved / reviewed by' }]} />
        </Card>
        <Provenance>collection_events (append-only workflow log), most recent 300.</Provenance>
      </Section>
    </div>
  );
}
