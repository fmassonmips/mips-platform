import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { todayISO } from '@/lib/period';
import { fmtMoney } from '@/lib/format';
import { dec } from '@/lib/money';
import { matchSupplierPayments, AMT_BASE, FX_JOIN } from '@/lib/services/treasury';
import { Flash, ReturnTo, currentUrl } from '../../../cash-flow/_components/flash';
import { approveSupplierInvoiceAction, rejectSupplierInvoiceAction, scheduleSupplierInvoiceAction, holdSupplierInvoiceAction, releaseSupplierInvoiceAction, setPriorityAction, markSupplierPaidAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SupplierInvoiceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { auth, sp } = await pageContext(searchParams, 'finance.view');
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const today = todayISO();
  const data = await tx(auth, async (t) => {
    const i = await one<any>(t, `SELECT si.id, si.number, si.invoice_date::text, si.due_date::text, si.currency, si.amount::text, si.fx_rate_to_base::text AS fx, (si.amount * si.fx_rate_to_base)::text AS amount_base, si.description,
        si.status, si.priority, si.scheduled_date::text, si.paid_date::text, si.payment_ref, si.submitted_by, si.approved_at::text, s.id AS supplier_id, s.code AS supplier_code, s.name AS supplier, s.bank_account_masked,
        su.name AS submitted_by_name, au.name AS approved_by_name, sc.name AS scheduled_by_name, a.code AS account_code, a.name AS account_name
      FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id LEFT JOIN users su ON su.id = si.submitted_by LEFT JOIN users au ON au.id = si.approved_by
      LEFT JOIN users sc ON sc.id = si.scheduled_by LEFT JOIN chart_of_accounts a ON a.id = si.account_id WHERE si.id = $1`, [id]);
    if (!i) return null;
    const bank = await q<any>(t, `SELECT bt.id, bt.reference, ${AMT_BASE('$3')}::text AS amount_base, bt.txn_date::text, ba.code AS account, bt.description FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id ${FX_JOIN('$3')}
      WHERE ba.account_class = 'operating' AND bt.amount < 0 AND upper(trim(bt.reference)) IN (upper(trim($1)), upper(trim(coalesce($2, ''))))`, [i.number, i.payment_ref, auth.baseCurrency]);
    const audit = await q<any>(t, `SELECT a.created_at::text AS at, a.action, coalesce(u.name, a.actor_label) AS actor, a.payload FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.entity_type = 'supplier_invoice' AND a.entity_id = $1 ORDER BY a.id DESC LIMIT 50`, [id]);
    return { i, bank, audit };
  });
  if (!data) notFound();
  const { i } = data;
  const here = currentUrl(`/suppliers/invoices/${id}`, sp);
  const canManage = auth.permissions.has('finance.manage');
  const canApprove = auth.permissions.has('finance.approve');
  const hid = <><ReturnTo value={here} /><input type="hidden" name="invoiceId" value={id} /></>;
  const rec = i.status === 'paid' ? matchSupplierPayments([{ id: i.id, number: i.number, payment_ref: i.payment_ref, amount_base: i.amount_base, paid_date: i.paid_date }], data.bank)[0] : null;
  const approved = ['approved', 'scheduled'].includes(i.status);
  return (
    <div>
      <PageHeader eyebrow="Treasury · Supplier payments" title={`${i.supplier_code} invoice ${i.number}`} subtitle={<><Link className="link" href={`/suppliers/${i.supplier_id}`}>{i.supplier}</Link> · {i.description ?? '—'} · GL {i.account_code ?? '—'} {i.account_name ?? ''} · <Link className="link" href="/suppliers">← Supplier payments</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[['Amount', fmtMoney(i.amount, i.currency, { dp: 2 })], [`In ${auth.baseCurrency}`, fmtMoney(i.amount_base, auth.baseCurrency, { dp: 2 })], ['Invoice / due', `${i.invoice_date} / ${i.due_date}`], ['Planned payment', i.scheduled_date ?? '—'], ['Paid', i.paid_date ? `${i.paid_date} (${i.payment_ref})` : '—'], ['Supplier account', i.bank_account_masked ?? '—']].map(([l, v]) => <Card key={l}><CardBody className="p-3"><div className="text-2xs text-muted">{l}</div><div className="mt-1 text-sm font-semibold num">{v}</div></CardBody></Card>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">Status <StatusBadge status={i.status} /> Priority <Badge tone={i.priority === 'critical' ? 'neg' : i.priority === 'high' ? 'warn' : 'neutral'}>{i.priority}</Badge> · submitted by <b>{i.submitted_by_name ?? '—'}</b>{i.approved_by_name && <> · approved by <b>{i.approved_by_name}</b> {i.approved_at?.slice(0, 16)}</>}{i.scheduled_by_name && <> · scheduled by <b>{i.scheduled_by_name}</b></>}{i.status !== 'paid' && i.due_date < today && <Badge tone="neg">past due</Badge>}</div>

      {!['paid', 'rejected'].includes(i.status) && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Approval & planning" subtitle="Approve / reject: finance.approve (submitter ≠ approver, DB CHECK). Schedule / hold / priority: finance.manage." />
            <CardBody className="space-y-3">
              {i.status === 'received' && canApprove && <div className="flex flex-wrap gap-2"><form action={approveSupplierInvoiceAction}>{hid}<button className="btn-primary">Approve</button></form></div>}
              {i.status === 'received' && !canApprove && <p className="text-sm text-muted">Awaiting approval by a user with finance.approve.</p>}
              {approved && canManage && <form action={scheduleSupplierInvoiceAction} className="flex flex-wrap items-end gap-2">{hid}<div><label className="label" htmlFor="sd">Planned payment date</label><input id="sd" type="date" name="scheduled_date" className="input w-auto" required min={today} defaultValue={i.scheduled_date ?? (i.due_date >= today ? i.due_date : today)} /></div><button className="btn">{i.status === 'scheduled' ? 'Reschedule' : 'Schedule payment'}</button></form>}
              {canManage && (i.status === 'on_hold' ? <form action={releaseSupplierInvoiceAction}>{hid}<button className="btn">Release hold</button></form> : <form action={holdSupplierInvoiceAction} className="flex flex-wrap items-end gap-2">{hid}<div className="flex-1"><label className="label" htmlFor="hr">Hold reason</label><input id="hr" name="reason" className="input" required minLength={5} /></div><button className="btn">Put on hold</button></form>)}
              {canManage && <form action={setPriorityAction} className="flex items-end gap-2">{hid}<div><label className="label" htmlFor="pr">Priority</label><select id="pr" name="priority" className="input w-auto" defaultValue={i.priority}><option>critical</option><option>high</option><option>normal</option><option>low</option></select></div><button className="btn">Set priority</button></form>}
              {canApprove && <form action={rejectSupplierInvoiceAction} className="flex flex-wrap items-end gap-2">{hid}<div className="flex-1"><label className="label" htmlFor="rr">Rejection reason</label><input id="rr" name="reason" className="input" required minLength={5} /></div><button className="btn-danger">Reject invoice</button></form>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Record payment (no payment is initiated)" subtitle="finance.approve · records a payment already executed in the bank" />
            <CardBody>
              <Callout tone="warn" title="Recording only">MIPS Executive OS does not connect to any bank for payments. Enter the bank’s payment reference after you have executed the payment in online banking.</Callout>
              {approved && canApprove ? <form action={markSupplierPaidAction} className="mt-3 flex flex-wrap items-end gap-2">{hid}<div><label className="label" htmlFor="pd">Payment date</label><input id="pd" type="date" name="paid_date" className="input w-auto" required max={today} defaultValue={today} /></div><div className="flex-1"><label className="label" htmlFor="pref">Bank payment reference</label><input id="pref" name="payment_ref" className="input" required minLength={3} maxLength={80} placeholder={`PAY-${i.supplier_code}-…`} /></div><button className="btn-gold">Mark as paid (record)</button></form>
                : <p className="mt-3 text-sm text-muted">{approved ? 'Requires finance.approve.' : 'The invoice must be approved (and not on hold) before a payment can be recorded.'}</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {i.status === 'paid' && rec && (
        <div className="mt-4"><Callout tone={rec.status === 'matched' ? 'pos' : rec.status === 'amount_difference' ? 'warn' : 'neg'} title={`Payment reconciliation: ${rec.status.replace('_', ' ')}`}>
          {rec.status === 'unmatched' ? `No operating-account bank outflow with reference ${i.payment_ref} or ${i.number} was found.` : `Bank line ${rec.bankDate}: ${fmtMoney(rec.bankAmount, auth.baseCurrency, { dp: 2 })}${rec.difference && !dec(rec.difference).isZero() ? ` — difference ${fmtMoney(rec.difference, auth.baseCurrency, { dp: 2 })}` : ' — amount agrees.'}`}
        </Callout></div>
      )}
      {data.bank.length > 0 && <Section title="Bank lines with this reference"><Card><table className="w-full text-xs"><tbody>{data.bank.map((b) => <tr key={b.id}><td className="td">{b.txn_date}</td><td className="td">{b.account}</td><td className="td">{b.reference}</td><td className="td">{b.description}</td><td className="td num text-right">{fmtMoney(b.amount_base, auth.baseCurrency, { dp: 2 })}</td></tr>)}</tbody></table></Card></Section>}
      <Section title="History (audit trail)">
        <Card><CardBody className="p-0"><table className="w-full text-xs"><tbody>{data.audit.length === 0 ? <tr><td className="td text-muted">No audited actions yet (demo-generated invoice).</td></tr> : data.audit.map((a, k) => <tr key={k}><td className="td">{a.at.slice(0, 19)}</td><td className="td">{a.actor}</td><td className="td">{a.action}</td><td className="td max-w-[500px] truncate" title={JSON.stringify(a.payload)}>{JSON.stringify(a.payload)}</td></tr>)}</tbody></table></CardBody></Card>
      </Section>
    </div>
  );
}
