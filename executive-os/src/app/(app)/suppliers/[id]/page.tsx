import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { PageHeader, Section } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { fmtMoney } from '@/lib/format';
import { sum } from '@/lib/money';
import { Flash, ReturnTo, currentUrl } from '../../cash-flow/_components/flash';
import { updateSupplierAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SupplierDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { auth, sp } = await pageContext(searchParams, 'finance.view');
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tx(auth, async (t) => {
    const s = await one<any>(t, 'SELECT id, code, name, category, payment_terms_days, currency, bank_account_masked, is_critical, is_active FROM suppliers WHERE id = $1', [id]);
    if (!s) return null;
    const inv = await q<any>(t, `SELECT id, number, invoice_date::text, due_date::text, status, priority, scheduled_date::text, paid_date::text, payment_ref, currency, (amount * fx_rate_to_base)::text AS amount_base FROM supplier_invoices WHERE supplier_id = $1 ORDER BY invoice_date DESC`, [id]);
    const audit = await q<any>(t, `SELECT a.created_at::text AS at, a.action, coalesce(u.name, a.actor_label) AS actor FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.entity_type = 'supplier' AND a.entity_id = $1 ORDER BY a.id DESC LIMIT 30`, [id]);
    return { s, inv, audit };
  });
  if (!data) notFound();
  const { s, inv } = data;
  const canManage = auth.permissions.has('finance.manage');
  const open = inv.filter((i) => !['paid', 'rejected'].includes(i.status));
  return (
    <div>
      <PageHeader eyebrow="Treasury · Supplier payments" title={`${s.code} — ${s.name}`} subtitle={<>{s.category} · terms {s.payment_terms_days} days · {s.currency} · account {s.bank_account_masked ?? '—'} {s.is_critical && <Badge tone="warn">critical</Badge>} {!s.is_active && <Badge>inactive</Badge>} · <Link className="link" href="/suppliers">← Supplier payments</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardBody><div className="text-xs text-muted">Open invoices</div><div className="text-lg font-semibold num">{fmtMoney(sum(open.map((i) => i.amount_base)).toString(), auth.baseCurrency)}</div><div className="text-2xs text-muted">{open.length} invoice(s)</div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-muted">Paid (all time)</div><div className="text-lg font-semibold num">{fmtMoney(sum(inv.filter((i) => i.status === 'paid').map((i) => i.amount_base)).toString(), auth.baseCurrency)}</div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-muted">Invoices</div><div className="text-lg font-semibold num">{inv.length}</div></CardBody></Card>
      </div>
      {canManage && (
        <Card className="mt-4">
          <CardHeader title="Edit supplier" subtitle="finance.manage · changes are audited (before/after)" />
          <CardBody>
            <form action={updateSupplierAction} className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              <ReturnTo value={currentUrl(`/suppliers/${id}`, sp)} /><input type="hidden" name="id" value={id} />
              <div><label className="label" htmlFor="code">Code</label><input id="code" name="code" className="input" required defaultValue={s.code} /></div>
              <div className="md:col-span-2"><label className="label" htmlFor="name">Name</label><input id="name" name="name" className="input" required defaultValue={s.name} /></div>
              <div><label className="label" htmlFor="category">Category</label><input id="category" name="category" className="input" required defaultValue={s.category} /></div>
              <div><label className="label" htmlFor="terms">Terms (days)</label><input id="terms" name="payment_terms_days" className="input" required defaultValue={s.payment_terms_days} inputMode="numeric" /></div>
              <div><label className="label" htmlFor="currency">Currency</label><input id="currency" name="currency" className="input" required defaultValue={s.currency} maxLength={3} /></div>
              <div><label className="label" htmlFor="bank">Bank account (masked)</label><input id="bank" name="bank_account_masked" className="input" defaultValue={s.bank_account_masked ?? ''} /></div>
              <div className="flex flex-col justify-end gap-1 text-xs"><label className="flex items-center gap-1"><input type="checkbox" name="is_critical" value="1" defaultChecked={s.is_critical} />Critical</label><label className="flex items-center gap-1"><input type="checkbox" name="is_active" value="0" defaultChecked={!s.is_active} />Deactivate</label></div>
              <div className="md:col-span-4 xl:col-span-8"><button className="btn-primary">Save supplier</button></div>
            </form>
          </CardBody>
        </Card>
      )}
      <Section title="Invoices">
        <Card><DataTable filename={`supplier-${s.code}-invoices`} rows={inv} columns={[{ key: 'number', label: 'Invoice', href: '/suppliers/invoices/{id}' }, { key: 'invoice_date', label: 'Date', kind: 'date' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'priority', label: 'Priority' }, { key: 'scheduled_date', label: 'Planned', kind: 'date' }, { key: 'paid_date', label: 'Paid', kind: 'date' }, { key: 'payment_ref', label: 'Payment ref' }, { key: 'amount_base', label: 'Amount', kind: 'money', dp: 2 }]} /></Card>
      </Section>
      <Section title="Audit trail">
        <Card><CardBody className="p-0"><table className="w-full text-xs"><tbody>{data.audit.length === 0 ? <tr><td className="td text-muted">No audited changes.</td></tr> : data.audit.map((a, i) => <tr key={i}><td className="td">{a.at.slice(0, 19)}</td><td className="td">{a.actor}</td><td className="td">{a.action}</td></tr>)}</tbody></table></CardBody></Card>
      </Section>
    </div>
  );
}
