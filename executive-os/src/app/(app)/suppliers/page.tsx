import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { todayISO, trailingMonths } from '@/lib/period';
import { monthEnd, monthsInRange, daysBetween } from '@/lib/dates';
import { fmtMoney, fmtPct, monthLabel } from '@/lib/format';
import { sum, safeDiv } from '@/lib/money';
import { accountBalances, cashSplit, nextMondayAfter, weekBuckets, matchSupplierPayments, AMT_BASE, FX_JOIN } from '@/lib/services/treasury';
import { Flash, ReturnTo, currentUrl, Provenance } from '../cash-flow/_components/flash';
import { approveSupplierInvoiceAction, createSupplierInvoiceAction, createSupplierAction } from './actions';

export const dynamic = 'force-dynamic';

interface SiRow { id: string; supplier_id: string; supplier: string; supplier_code: string; number: string; invoice_date: string; due_date: string; currency: string; amount: string; amount_base: string; description: string | null; status: string; priority: string; scheduled_date: string | null; paid_date: string | null; payment_ref: string | null; submitted_by: string | null; submitted_by_name: string | null; approved_by_name: string | null; is_critical: boolean }

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months: allMonths, fyears } = await pageContext(searchParams, 'finance.view');
  const base = auth.baseCurrency;
  const today = todayISO();
  const start = nextMondayAfter(today);
  const histMonths = (period.months >= 2 ? monthsInRange(period.start, period.end) : trailingMonths(period.end, 12)).slice(-24);
  const hFrom = histMonths[0], hTo = monthEnd(histMonths[histMonths.length - 1]);
  const f = { status: spGet(sp, 'status') ?? '', supplier: spGet(sp, 'supplier') ?? '', priority: spGet(sp, 'priority') ?? '', from: spGet(sp, 'from') ?? '', to: spGet(sp, 'to') ?? '' };
  const data = await tx(auth, async (t) => {
    const invoices = await q<SiRow>(t, `SELECT si.id, si.supplier_id, s.name AS supplier, s.code AS supplier_code, si.number, si.invoice_date::text, si.due_date::text, si.currency, si.amount::text, (si.amount * si.fx_rate_to_base)::text AS amount_base,
        si.description, si.status, si.priority, si.scheduled_date::text, si.paid_date::text, si.payment_ref, si.submitted_by, su.name AS submitted_by_name, au.name AS approved_by_name, s.is_critical
      FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id LEFT JOIN users su ON su.id = si.submitted_by LEFT JOIN users au ON au.id = si.approved_by
      ORDER BY coalesce(si.scheduled_date, si.due_date) DESC`);
    const suppliers = await q<any>(t, `SELECT s.id, s.code, s.name, s.category, s.payment_terms_days, s.currency, s.bank_account_masked, s.is_critical, s.is_active,
        coalesce(sum(si.amount * si.fx_rate_to_base) FILTER (WHERE si.status NOT IN ('paid','rejected')),0)::text AS open_amount,
        count(si.id) FILTER (WHERE si.status NOT IN ('paid','rejected'))::text AS open_n,
        coalesce(sum(si.amount * si.fx_rate_to_base) FILTER (WHERE si.paid_date BETWEEN $1 AND $2),0)::text AS paid_period
      FROM suppliers s LEFT JOIN supplier_invoices si ON si.supplier_id = s.id GROUP BY s.id ORDER BY s.code`, [hFrom, hTo]);
    const bank = await q<{ id: string; reference: string | null; amount_base: string; txn_date: string }>(t, `SELECT bt.id, bt.reference, ${AMT_BASE('$3')}::text AS amount_base, bt.txn_date::text
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id ${FX_JOIN('$3')}
      WHERE ba.account_class = 'operating' AND bt.amount < 0 AND bt.txn_date BETWEEN $1::date - 60 AND $2::date + 30`, [hFrom, hTo, base]);
    const bal = await accountBalances(t, today, base);
    return { invoices, suppliers, bank, opening: cashSplit(bal).operating };
  });

  const unpaid = data.invoices.filter((i) => !['paid', 'rejected'].includes(i.status));
  const tot = (rows: SiRow[]) => sum(rows.map((r) => r.amount_base));
  const byStatus = (s: string) => unpaid.filter((i) => i.status === s);
  const overdue = unpaid.filter((i) => i.due_date < today);
  const cal = weekBuckets(unpaid.map((i) => ({ ...i, date: i.scheduled_date ?? i.due_date, amount: i.amount_base })), start, 8);
  let cum = cal.overdue.total;
  const calRows = [{ label: `Overdue / due before ${start}`, weekStart: '', total: cal.overdue.total, n: cal.overdue.items.length, cum: cal.overdue.total, items: cal.overdue.items },
    ...cal.buckets.map((b) => { cum = cum.plus(b.total); return { label: `w/c ${b.weekStart}`, weekStart: b.weekStart, total: b.total, n: b.items.length, cum, items: b.items }; })];
  const filtered = data.invoices.filter((i) => (!f.status || i.status === f.status) && (!f.supplier || i.supplier_id === f.supplier) && (!f.priority || i.priority === f.priority) && (!f.from || i.due_date >= f.from) && (!f.to || i.due_date <= f.to));
  const paidHist = data.invoices.filter((i) => i.status === 'paid' && i.paid_date && i.paid_date >= hFrom && i.paid_date <= hTo);
  const histChart = histMonths.map((m) => ({ month: monthLabel(m), paid: tot(paidHist.filter((i) => i.paid_date!.slice(0, 7) === m.slice(0, 7))).toString() }));
  const recon = matchSupplierPayments(paidHist.map((i) => ({ id: i.id, number: i.number, payment_ref: i.payment_ref, amount_base: i.amount_base, paid_date: i.paid_date })), data.bank);
  const reconCounts = { matched: recon.filter((r) => r.status === 'matched').length, diff: recon.filter((r) => r.status === 'amount_difference').length, unmatched: recon.filter((r) => r.status === 'unmatched').length };
  const queue = byStatus('received');
  const here = currentUrl('/suppliers', sp);
  const canManage = auth.permissions.has('finance.manage');
  const canApprove = auth.permissions.has('finance.approve');

  return (
    <div>
      <PageHeader eyebrow="Treasury" title="Supplier payment planner"
        subtitle={<>Supplier invoices (accounts payable), approval, payment planning and reconciliation of recorded payments against bank statement lines. Amounts in {base}. Period filter sets the history and reconciliation window ({hFrom} → {hTo}).</>}
        actions={<PeriodFilter current={period.key} months={allMonths} fyears={fyears} allowCompare={false} />} />
      <Flash sp={sp} />
      <Callout tone="warn" title="The system never initiates payments">Scheduling only plans a payment date for cash forecasting. “Mark as paid” records a payment you have already executed through the bank (payment reference required, finance.approve) — it does not send any instruction to a bank.</Callout>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {([['Unpaid (all)', unpaid, ''], ['Awaiting approval', byStatus('received'), 'received'], ['Approved, not scheduled', byStatus('approved'), 'approved'], ['Scheduled', byStatus('scheduled'), 'scheduled'], ['On hold', byStatus('on_hold'), 'on_hold'], ['Past due', overdue, '']] as [string, SiRow[], string][]).map(([l, rows, st]) => (
          <Link key={l} href={st ? `/suppliers?status=${st}#registry` : '/suppliers#registry'} className="card block p-3"><div className="text-2xs text-muted">{l}</div><div className={`mt-1 text-lg font-semibold num ${l === 'Past due' && rows.length ? 'text-neg' : ''}`}>{fmtMoney(tot(rows).toString(), base)}</div><div className="text-2xs text-muted">{rows.length} invoice(s)</div></Link>
        ))}
      </div>

      <Section title={`Payment calendar — next 8 weeks from ${start}`}>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th">Week</th><th className="th text-right">Invoices</th><th className="th">Suppliers</th><th className="th text-right">Planned payments</th><th className="th text-right">Cumulative</th><th className="th text-right">% of operating cash</th><th className="th text-right">Operating cash less cumulative AP</th></tr></thead>
                <tbody>{calRows.map((r) => (
                  <tr key={r.label} className={r.weekStart === '' && r.n ? 'bg-warn/10' : ''}>
                    <td className="td">{r.label}</td><td className="td num text-right">{r.n}</td>
                    <td className="td max-w-[320px] whitespace-normal">{r.items.map((i) => <Link key={i.id} className="mr-2 link" href={`/suppliers/invoices/${i.id}`}>{i.supplier_code} {i.number}{i.status !== 'scheduled' ? ` (${i.status.replace('_', ' ')})` : ''}</Link>)}</td>
                    <td className="td num text-right">{fmtMoney(r.total.neg().toString(), '')}</td><td className="td num text-right">{fmtMoney(r.cum.neg().toString(), '')}</td>
                    <td className="td num text-right">{fmtPct(safeDiv(r.total, data.opening)?.toString() ?? null)}</td>
                    <td className="td num text-right">{fmtMoney(data.opening.minus(r.cum).toString(), '')}</td>
                  </tr>))}
                  <tr className="bg-surface-2 font-semibold"><td className="td">Total (8 weeks + overdue)</td><td className="td num text-right">{calRows.reduce((a, r) => a + r.n, 0)}</td><td className="td">{cal.later.items.length > 0 && `${cal.later.items.length} later invoice(s): ${fmtMoney(cal.later.total.toString(), base)}`}</td><td className="td num text-right">{fmtMoney(cum.neg().toString(), '')}</td><td className="td" /><td className="td num text-right">{fmtPct(safeDiv(cum, data.opening)?.toString() ?? null)}</td><td className="td" /></tr>
                </tbody>
              </table>
            </div>
          </Card>
          <Card><CardHeader title="Weekly supplier outflows" subtitle={`Opening operating cash ${fmtMoney(data.opening.toString(), base, { compact: true })} (forecast opening, operating accounts only)`} /><CardBody><TrendChart data={calRows.map((r) => ({ week: r.weekStart ? r.weekStart.slice(5) : 'overdue', out: r.total.toString(), remain: data.opening.minus(r.cum).toString() }))} x="week" series={[{ key: 'out', label: 'Planned payments', type: 'bar', color: '#c43131' }, { key: 'remain', label: 'Operating cash less cumulative AP (right)', type: 'line', yAxis: 'right', color: '#173166' }]} /></CardBody></Card>
        </div>
        <Provenance>supplier_invoices not paid/rejected (incl. received and on hold), planned on scheduled_date or else due_date. Impact is shown against operating cash at {today} only; receipts and other flows are in the <Link className="link" href="/treasury-forecast">13-week forecast</Link>.</Provenance>
      </Section>

      {queue.length > 0 && (
        <Section title={`Approval queue (${queue.length})`}>
          <Card>
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className="th">Invoice</th><th className="th">Supplier</th><th className="th">Due</th><th className="th">Priority</th><th className="th text-right">Amount</th><th className="th">Submitted by</th><th className="th no-print">Action</th></tr></thead>
              <tbody>{queue.sort((a, b) => a.due_date.localeCompare(b.due_date)).map((i) => (
                <tr key={i.id}><td className="td"><Link className="link" href={`/suppliers/invoices/${i.id}`}>{i.number}</Link></td><td className="td">{i.supplier}{i.is_critical && <Badge tone="warn" className="ml-1">critical</Badge>}</td><td className={`td ${i.due_date < today ? 'text-neg' : ''}`}>{i.due_date}</td><td className="td">{i.priority}</td><td className="td num text-right">{fmtMoney(i.amount_base, '', { dp: 2 })}</td><td className="td">{i.submitted_by_name ?? '—'}</td>
                  <td className="td no-print">{canApprove ? (i.submitted_by === auth.userId ? <span className="text-2xs text-muted">Submitted by you — another approver required</span> : <form action={approveSupplierInvoiceAction}><ReturnTo value={here} /><input type="hidden" name="invoiceId" value={i.id} /><button className="btn-primary py-1 text-xs">Approve</button></form>) : <span className="text-2xs text-muted">Needs finance.approve</span>}</td></tr>))}</tbody>
            </table>
          </Card>
          <p className="mt-1 text-2xs text-muted">Submitter ≠ approver is enforced by a database CHECK on supplier_invoices.</p>
        </Section>
      )}

      <Section title="Invoice registry">
        <Card id="registry">
          <CardBody className="border-b border-border">
            <form method="get" className="flex flex-wrap items-end gap-2 text-xs">
              <input type="hidden" name="range" value={period.key} />
              <div><label className="label" htmlFor="f-status">Status</label><select id="f-status" name="status" className="input w-auto py-1 text-xs" defaultValue={f.status}><option value="">All</option>{['received', 'approved', 'scheduled', 'on_hold', 'paid', 'rejected'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
              <div><label className="label" htmlFor="f-supplier">Supplier</label><select id="f-supplier" name="supplier" className="input w-auto py-1 text-xs" defaultValue={f.supplier}><option value="">All</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></div>
              <div><label className="label" htmlFor="f-priority">Priority</label><select id="f-priority" name="priority" className="input w-auto py-1 text-xs" defaultValue={f.priority}><option value="">All</option>{['critical', 'high', 'normal', 'low'].map((p) => <option key={p}>{p}</option>)}</select></div>
              <div><label className="label" htmlFor="f-from">Due from</label><input id="f-from" type="date" name="from" className="input w-auto py-1 text-xs" defaultValue={f.from} /></div>
              <div><label className="label" htmlFor="f-to">Due to</label><input id="f-to" type="date" name="to" className="input w-auto py-1 text-xs" defaultValue={f.to} /></div>
              <button className="btn py-1 text-xs">Filter</button><Link className="link" href={`/suppliers?range=${encodeURIComponent(period.key)}#registry`}>Clear</Link>
            </form>
          </CardBody>
          <DataTable filename="supplier-invoices" rows={filtered.map((i) => ({ ...i, days_to_due: i.status === 'paid' || i.status === 'rejected' ? null : daysBetween(today, i.due_date) }))} pageSize={20}
            columns={[{ key: 'number', label: 'Invoice', href: '/suppliers/invoices/{id}' }, { key: 'supplier', label: 'Supplier', href: '/suppliers/{supplier_id}' }, { key: 'invoice_date', label: 'Date', kind: 'date' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'days_to_due', label: 'Days to due', kind: 'number' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'priority', label: 'Priority' }, { key: 'scheduled_date', label: 'Planned', kind: 'date' }, { key: 'paid_date', label: 'Paid', kind: 'date' }, { key: 'payment_ref', label: 'Payment ref' }, { key: 'approved_by_name', label: 'Approved by' }, { key: 'currency', label: 'Ccy' }, { key: 'amount_base', label: `Amount (${base})`, kind: 'money', dp: 2 }]}
            footer={{ number: 'Total', amount_base: tot(filtered).toString() }} />
        </Card>
        {canManage && data.suppliers.length > 0 && (
          <details className="card mt-3"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Register a supplier invoice</summary>
            <form action={createSupplierInvoiceAction} className="grid gap-3 border-t border-border p-4 md:grid-cols-4 xl:grid-cols-8">
              <ReturnTo value={here} />
              <div className="md:col-span-2"><label className="label" htmlFor="si-sup">Supplier</label><select id="si-sup" name="supplier_id" className="input" required>{data.suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.payment_terms_days} d)</option>)}</select></div>
              <div><label className="label" htmlFor="si-num">Invoice number</label><input id="si-num" name="number" className="input" required maxLength={60} /></div>
              <div><label className="label" htmlFor="si-date">Invoice date</label><input id="si-date" type="date" name="invoice_date" className="input" required defaultValue={today} /></div>
              <div><label className="label" htmlFor="si-due">Due date (blank = terms)</label><input id="si-due" type="date" name="due_date" className="input" /></div>
              <div><label className="label" htmlFor="si-amt">Amount</label><input id="si-amt" name="amount" className="input" required inputMode="decimal" /></div>
              <div><label className="label" htmlFor="si-ccy">Currency</label><input id="si-ccy" name="currency" className="input" required defaultValue={base} maxLength={3} /></div>
              <div><label className="label" htmlFor="si-fx">FX to {base} (if foreign)</label><input id="si-fx" name="fx_rate_to_base" className="input" inputMode="decimal" /></div>
              <div className="md:col-span-3"><label className="label" htmlFor="si-desc">Description</label><input id="si-desc" name="description" className="input" maxLength={300} /></div>
              <div><label className="label" htmlFor="si-pri">Priority</label><select id="si-pri" name="priority" className="input" defaultValue="normal"><option>critical</option><option>high</option><option>normal</option><option>low</option></select></div>
              <div className="flex items-end"><button className="btn-primary">Register (status received)</button></div>
            </form>
          </details>
        )}
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Historical supplier payments" subtitle={`Recorded paid invoices by payment month, ${monthLabel(hFrom)} – ${monthLabel(histMonths[histMonths.length - 1])} · total ${fmtMoney(tot(paidHist).toString(), base)}`} />
          <CardBody><TrendChart data={histChart} x="month" series={[{ key: 'paid', label: 'Paid', type: 'bar', color: '#173166' }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Payment reconciliation" subtitle="Paid invoices vs operating-account bank outflows by payment reference or invoice number" />
          <CardBody>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-2xs text-muted">Matched</div><div className="text-lg font-semibold text-pos">{reconCounts.matched}</div></div>
              <div><div className="text-2xs text-muted">Amount difference</div><div className="text-lg font-semibold text-warn">{reconCounts.diff}</div></div>
              <div><div className="text-2xs text-muted">No bank line found</div><div className={`text-lg font-semibold ${reconCounts.unmatched ? 'text-neg' : ''}`}>{reconCounts.unmatched}</div></div>
            </div>
            <p className="mt-2 text-2xs text-muted">A paid invoice without a bank line may be paid from a non-imported account, or recorded in error — investigate. No tolerance is applied and nothing is adjusted automatically.</p>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-3">
        <DataTable filename="supplier-payment-reconciliation" rows={recon.map((r) => ({ ...r, supplier: paidHist.find((p) => p.id === r.id)?.supplier }))} pageSize={15}
          columns={[{ key: 'number', label: 'Invoice', href: '/suppliers/invoices/{id}' }, { key: 'supplier', label: 'Supplier' }, { key: 'paid_date', label: 'Paid (recorded)', kind: 'date' }, { key: 'payment_ref', label: 'Payment ref' }, { key: 'amount_base', label: 'Invoice amount', kind: 'money', dp: 2 }, { key: 'bankDate', label: 'Bank date', kind: 'date' }, { key: 'bankAmount', label: 'Bank amount', kind: 'money', dp: 2 }, { key: 'difference', label: 'Difference', kind: 'money', dp: 2 }, { key: 'status', label: 'Result', kind: 'badge' }]} />
      </Card>

      <Section title={`Supplier master data (${data.suppliers.length})`}>
        <Card>
          <DataTable filename="suppliers" rows={data.suppliers.map((s) => ({ ...s, critical: s.is_critical ? 'yes' : '', active: s.is_active ? 'active' : 'inactive' }))}
            columns={[{ key: 'code', label: 'Code', href: '/suppliers/{id}' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'payment_terms_days', label: 'Terms (days)', kind: 'number' }, { key: 'currency', label: 'Ccy' }, { key: 'bank_account_masked', label: 'Bank account' }, { key: 'critical', label: 'Critical' }, { key: 'active', label: 'Status', kind: 'badge' }, { key: 'open_n', label: 'Open invoices', kind: 'number' }, { key: 'open_amount', label: 'Open amount', kind: 'money' }, { key: 'paid_period', label: 'Paid in window', kind: 'money' }]} />
        </Card>
        {canManage && (
          <details className="card mt-3"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Create supplier</summary>
            <form action={createSupplierAction} className="grid gap-3 border-t border-border p-4 md:grid-cols-4 xl:grid-cols-8">
              <ReturnTo value={here} />
              <div><label className="label" htmlFor="s-code">Code</label><input id="s-code" name="code" className="input" required maxLength={20} /></div>
              <div className="md:col-span-2"><label className="label" htmlFor="s-name">Name</label><input id="s-name" name="name" className="input" required maxLength={200} /></div>
              <div><label className="label" htmlFor="s-cat">Category</label><input id="s-cat" name="category" className="input" required placeholder="cloud, software…" /></div>
              <div><label className="label" htmlFor="s-terms">Terms (days)</label><input id="s-terms" name="payment_terms_days" className="input" required defaultValue="30" inputMode="numeric" /></div>
              <div><label className="label" htmlFor="s-ccy">Currency</label><input id="s-ccy" name="currency" className="input" required defaultValue={base} maxLength={3} /></div>
              <div><label className="label" htmlFor="s-bank">Bank account (masked)</label><input id="s-bank" name="bank_account_masked" className="input" placeholder="****1234" /></div>
              <div className="flex items-end gap-3"><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_critical" value="1" />Critical</label><button className="btn-primary">Create</button></div>
            </form>
          </details>
        )}
      </Section>
      <p className="mt-4 text-2xs text-muted">All amounts converted with the invoice fx_rate_to_base; bank lines at the exchange rate on the transaction date.</p>
    </div>
  );
}
