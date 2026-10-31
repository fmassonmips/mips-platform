import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { todayISO } from '@/lib/period';
import { daysBetween } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { dec } from '@/lib/money';
import { bucketFor, BUCKET_LABELS } from '@/lib/engine/aging';
import { policyFor, renderTemplate } from '@/lib/services/treasury';
import { Flash, ReturnTo, currentUrl } from '../../cash-flow/_components/flash';
import { draftReminderAction, approveReminderAction, rejectReminderAction, markReminderSentAction, recordPromiseAction, setDisputeAction, addNoteAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { auth, sp } = await pageContext(searchParams, 'finance.view');
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const today = todayISO();
  const data = await tx(auth, async (t) => {
    const inv = await one<any>(t, `SELECT ci.*, ci.issue_date::text AS issue_date, ci.due_date::text AS due_date, ci.promise_date::text AS promise_date, ci.paid_date::text AS paid_date,
        ci.amount::text AS amount, ci.amount_paid::text AS amount_paid, ci.fx_rate_to_base::text AS fx, m.name AS customer, m.code AS customer_code
      FROM customer_invoices ci JOIN merchants m ON m.id = ci.merchant_id WHERE ci.id = $1`, [id]);
    if (!inv) return null;
    const events = await q<any>(t, `SELECT e.id, e.kind, e.status, e.note, e.message_draft, e.created_at::text, e.created_by, cu.name AS created_by_name, au.name AS approved_by_name
      FROM collection_events e LEFT JOIN users cu ON cu.id = e.created_by LEFT JOIN users au ON au.id = e.approved_by WHERE e.invoice_id = $1 ORDER BY e.created_at DESC`, [id]);
    const policies = await q<{ id: string; days_overdue: number; action: string; template: string; requires_approval: boolean }>(t, 'SELECT id, days_overdue, action, template, requires_approval FROM collection_policies ORDER BY days_overdue');
    const others = await q<any>(t, `SELECT id, number, due_date::text, status, (amount - amount_paid)::text AS outstanding FROM customer_invoices WHERE merchant_id = $1 AND id <> $2 AND status IN ('open','partially_paid') ORDER BY due_date`, [inv.merchant_id, id]);
    const audit = await q<any>(t, `SELECT a.created_at::text AS at, a.action, coalesce(u.name, a.actor_label) AS actor FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.entity_type = 'customer_invoice' AND a.entity_id = $1 ORDER BY a.id DESC LIMIT 50`, [id]);
    return { inv, events, policies, others, audit };
  });
  if (!data) notFound();
  const { inv, events, policies } = data;
  const outstanding = dec(inv.amount).minus(inv.amount_paid);
  const daysOver = Math.max(0, daysBetween(inv.due_date, today));
  const open = ['open', 'partially_paid'].includes(inv.status);
  const pol = policyFor(policies, daysOver);
  const chosen = policies.find((p) => p.id === sp.policy) ?? pol;
  const draftText = chosen ? renderTemplate(chosen.template, { merchant: inv.customer, number: inv.number, amount: fmtMoney(outstanding.toString(), inv.currency, { dp: 2 }), due_date: inv.due_date, days: String(daysOver) }) : '';
  const here = currentUrl(`/receivables/${id}`, sp);
  const canManage = auth.permissions.has('finance.manage');
  const canApprove = auth.permissions.has('finance.approve');
  const sentDrafts = new Set(events.filter((e) => e.kind === 'reminder_sent').map((e) => /draft ([0-9a-f-]{36})/.exec(e.note ?? '')?.[1]));
  const pendingDraft = events.find((e) => e.kind === 'reminder_drafted' && e.status === 'pending_approval');
  const hid = <><ReturnTo value={here} /><input type="hidden" name="invoiceId" value={id} /></>;

  return (
    <div>
      <PageHeader eyebrow="Treasury · Accounts receivable" title={`Invoice ${inv.number}`}
        subtitle={<>{inv.customer} · {inv.description ?? '—'} · <Link className="link" href="/receivables">← Receivables</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[['Amount', fmtMoney(inv.amount, inv.currency, { dp: 2 })], ['Paid', fmtMoney(inv.amount_paid, inv.currency, { dp: 2 })], ['Outstanding', fmtMoney(outstanding.toString(), inv.currency, { dp: 2 })], ['Issued / due', `${inv.issue_date} / ${inv.due_date}`], ['Days overdue (today)', open ? `${daysOver} · ${BUCKET_LABELS[bucketFor(inv.due_date, today)]}` : '—'], ['Promise date', inv.promise_date ?? '—']].map(([l, v]) => (
          <Card key={l}><CardBody className="p-3"><div className="text-2xs text-muted">{l}</div><div className="mt-1 text-sm font-semibold num">{v}</div></CardBody></Card>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">Status <StatusBadge status={inv.status} /> Collection <StatusBadge status={inv.collection_status} /> {inv.disputed && <Badge tone="neg">disputed</Badge>} {inv.paid_date && <span className="text-muted">paid {inv.paid_date}</span>} {inv.currency !== auth.baseCurrency && <span className="text-muted">FX to {auth.baseCurrency}: {inv.fx}</span>}</div>
      {inv.disputed && <div className="mt-3"><Callout tone="neg" title="Disputed invoice">{inv.dispute_reason}</Callout></div>}

      {open && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Draft reminder (policy-based)" subtitle={pol ? `Applicable policy for ${daysOver} days overdue: ${pol.action.replace('_', ' ')} (≥ ${pol.days_overdue} days)` : 'Not yet overdue — no policy applies automatically; you may still choose one.'} />
            <CardBody>
              <Callout tone="warn" title="Nothing is sent by the system">The draft must be approved by a different user with finance.approve. After approval, send it yourself and record it with “Mark as sent (manual)”.</Callout>
              {canManage ? (pendingDraft ? <p className="mt-3 text-sm text-muted">A draft is already awaiting approval (see history below).</p> : (
                <>
                  <form method="get" className="mt-3 flex items-end gap-2"><div><label className="label" htmlFor="policy">Policy / template</label><select id="policy" name="policy" className="input w-auto" defaultValue={chosen?.id}>{policies.map((p) => <option key={p.id} value={p.id}>{p.action.replace('_', ' ')} (≥ {p.days_overdue} d){p.id === pol?.id ? ' — applicable' : ''}</option>)}</select></div><button className="btn">Load template</button></form>
                  {chosen && <form action={draftReminderAction} className="mt-3 space-y-2">{hid}<input type="hidden" name="policyId" value={chosen.id} />
                    <textarea name="message" className="input h-28" defaultValue={draftText} required minLength={10} maxLength={4000} aria-label="Reminder text" />
                    <button className="btn-primary">Draft reminder (requires approval)</button></form>}
                </>
              )) : <p className="mt-3 text-sm text-muted">Drafting requires finance.manage.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Collection actions" subtitle="Recorded in collection_events and the audit trail" />
            <CardBody className="space-y-4">
              {canManage ? <>
                <form action={recordPromiseAction} className="flex flex-wrap items-end gap-2">{hid}<div><label className="label" htmlFor="promise_date">Payment promise date</label><input id="promise_date" type="date" name="promise_date" className="input w-auto" required defaultValue={inv.promise_date ?? ''} /></div><input name="note" className="input w-56" placeholder="Who promised / how (optional)" /><button className="btn">Record promise</button></form>
                <form action={setDisputeAction} className="flex flex-wrap items-end gap-2">{hid}<input type="hidden" name="disputed" value={inv.disputed ? '0' : '1'} /><div className="flex-1"><label className="label" htmlFor="reason">{inv.disputed ? 'Reason the dispute is cleared' : 'Dispute reason'}</label><input id="reason" name="reason" className="input" required minLength={5} /></div><button className={inv.disputed ? 'btn' : 'btn-danger'}>{inv.disputed ? 'Clear dispute' : 'Mark disputed'}</button></form>
              </> : <p className="text-sm text-muted">Collection actions require finance.manage.</p>}
              {canManage && <form action={addNoteAction} className="flex items-end gap-2">{hid}<div className="flex-1"><label className="label" htmlFor="note">Note</label><input id="note" name="note" className="input" required minLength={3} /></div><button className="btn">Add note</button></form>}
            </CardBody>
          </Card>
        </div>
      )}

      <Section title={`History (${events.length})`}>
        <Card>
          {events.length === 0 ? <CardBody className="text-sm text-muted">No collection events recorded for this invoice.</CardBody> : (
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className="th">When</th><th className="th">Event</th><th className="th">Status</th><th className="th">Details</th><th className="th">By</th><th className="th">Approved / reviewed by</th><th className="th no-print">Action</th></tr></thead>
              <tbody>{events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="td">{e.created_at.slice(0, 16)}</td><td className="td"><StatusBadge status={e.kind} /></td><td className="td"><StatusBadge status={e.status === 'pending_approval' ? 'pending' : e.status} /></td>
                  <td className="td max-w-[480px] whitespace-pre-wrap">{(e.note ?? '').replace(/\[policy:\w+\]\s*/, '')}{e.message_draft && <div className="mt-1 rounded border border-border bg-surface-2 p-2">{e.message_draft}</div>}</td>
                  <td className="td">{e.created_by_name}</td><td className="td">{e.approved_by_name ?? '—'}</td>
                  <td className="td no-print">
                    {e.kind === 'reminder_drafted' && e.status === 'pending_approval' && canApprove && (e.created_by === auth.userId ? <span className="text-2xs text-muted">Drafted by you — another approver required</span> : <div className="flex flex-col gap-1">
                      <form action={approveReminderAction}><ReturnTo value={here} /><input type="hidden" name="eventId" value={e.id} /><button className="btn-primary py-1 text-xs">Approve</button></form>
                      <form action={rejectReminderAction} className="flex gap-1"><ReturnTo value={here} /><input type="hidden" name="eventId" value={e.id} /><input className="input w-32 py-1 text-xs" name="note" placeholder="Reason" required minLength={3} /><button className="btn py-1 text-xs">Reject</button></form></div>)}
                    {e.kind === 'reminder_drafted' && e.status === 'approved' && !sentDrafts.has(e.id) && canManage && open && <form action={markReminderSentAction} className="flex flex-wrap gap-1"><ReturnTo value={here} /><input type="hidden" name="eventId" value={e.id} /><select name="channel" className="input w-24 py-1 text-xs" aria-label="Channel"><option value="email">E-mail</option><option value="letter">Letter</option><option value="phone">Phone</option><option value="in_person">In person</option><option value="other">Other</option></select><input className="input w-28 py-1 text-xs" name="note" placeholder="Note" /><button className="btn-gold py-1 text-xs">Mark as sent (manual)</button></form>}
                    {e.kind === 'reminder_drafted' && sentDrafts.has(e.id) && <span className="text-2xs text-pos">recorded as sent</span>}
                  </td>
                </tr>))}</tbody>
            </table>
          )}
        </Card>
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title={`Other open invoices — ${inv.customer}`} /><CardBody className="p-0">
          <table className="w-full text-xs"><tbody>{data.others.length === 0 ? <tr><td className="td text-muted">None</td></tr> : data.others.map((o) => <tr key={o.id}><td className="td"><Link className="link" href={`/receivables/${o.id}`}>{o.number}</Link></td><td className="td">{o.due_date}</td><td className="td"><StatusBadge status={o.status} /></td><td className="td num text-right">{fmtMoney(o.outstanding, inv.currency)}</td></tr>)}</tbody></table>
        </CardBody></Card>
        <Card><CardHeader title="Audit trail" /><CardBody className="p-0">
          <table className="w-full text-xs"><tbody>{data.audit.length === 0 ? <tr><td className="td text-muted">No audited actions yet.</td></tr> : data.audit.map((a, i) => <tr key={i}><td className="td">{a.at.slice(0, 19)}</td><td className="td">{a.actor}</td><td className="td">{a.action}</td></tr>)}</tbody></table>
        </CardBody></Card>
      </div>
    </div>
  );
}
