import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { monthEnd } from '@/lib/dates';
import { todayISO } from '@/lib/period';
import { fmtMoney, monthLabel } from '@/lib/format';
import { sum } from '@/lib/money';
import { AMT_BASE, FX_JOIN } from '@/lib/services/treasury';
import { Provenance } from '../_components/flash';

export const dynamic = 'force-dynamic';

export default async function BankTransactionsPage({ searchParams }: { searchParams: SP }) {
  const { auth, sp } = await pageContext(searchParams, 'finance.view');
  const base = auth.baseCurrency;
  const monthRaw = spGet(sp, 'month') ?? '';
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? `${monthRaw}-01` : `${todayISO().slice(0, 7)}-01`;
  const account = spGet(sp, 'account') ?? '';
  const cls = spGet(sp, 'class') ?? '';
  const category = spGet(sp, 'category') ?? '';
  const { rows, accounts } = await tx(auth, async (t) => {
    const params: unknown[] = [month, monthEnd(month), base];
    let where = '';
    if (account) { params.push(account); where += ` AND ba.code = $${params.length}`; }
    if (cls) { params.push(cls); where += ` AND ba.account_class = $${params.length}`; }
    if (category) { params.push(category); where += ` AND coalesce(bt.category,'other') = $${params.length}`; }
    const rows = await q<any>(t, `SELECT bt.id, bt.txn_date::text AS date, ba.code AS account, ba.account_class AS cls, bt.description, bt.reference, bt.counterparty, coalesce(bt.category,'other') AS category,
        bt.currency, bt.amount::text AS amount, ${AMT_BASE('$3')}::text AS amount_base, bt.bank_ref
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id ${FX_JOIN('$3')}
      WHERE bt.txn_date BETWEEN $1 AND $2 ${where} ORDER BY bt.txn_date, bt.bank_ref`, params);
    const accounts = await q<{ code: string }>(t, 'SELECT code FROM bank_accounts ORDER BY code');
    return { rows, accounts };
  });
  const total = sum(rows.map((r) => r.amount_base ?? '0'));
  const link = (o: Record<string, string>) => { const p = new URLSearchParams({ month: month.slice(0, 7), ...(account ? { account } : {}), ...(cls ? { class: cls } : {}), ...(category ? { category } : {}), ...o }); for (const [k, v] of [...p.entries()]) if (!v) p.delete(k); return `/cash-flow/transactions?${p}`; };
  return (
    <div>
      <PageHeader eyebrow="Treasury · Cash flow" title={`Bank statement lines — ${monthLabel(month)}`}
        subtitle={<>Filters: account {account || 'all'} · class {cls || 'all'} · category {category || 'all'}. Net {fmtMoney(total.toString(), base, { dp: 2 })} over {rows.length} line(s). <Link className="link" href="/cash-flow">← Cash flow</Link></>}
        actions={<form className="flex flex-wrap items-center gap-2" method="get">
          <input type="month" name="month" className="input w-auto py-1 text-xs" defaultValue={month.slice(0, 7)} aria-label="Month" />
          <select name="account" className="input w-auto py-1 text-xs" defaultValue={account} aria-label="Account"><option value="">All accounts</option>{accounts.map((a) => <option key={a.code}>{a.code}</option>)}</select>
          <select name="class" className="input w-auto py-1 text-xs" defaultValue={cls} aria-label="Class"><option value="">All classes</option><option value="operating">Operating</option><option value="restricted">Restricted</option><option value="safeguarded">Safeguarded</option><option value="merchant_settlement">Merchant settlement</option></select>
          <input name="category" className="input w-32 py-1 text-xs" defaultValue={category} placeholder="category" aria-label="Category" />
          <button className="btn py-1 text-xs">Apply</button>
          {(account || cls || category) && <Link className="link text-xs" href={link({ account: '', class: '', category: '' })}>Clear</Link>}
        </form>} />
      <Card>
        <DataTable filename={`bank-lines-${month.slice(0, 7)}`} rows={rows} pageSize={50}
          columns={[{ key: 'date', label: 'Date', kind: 'date' }, { key: 'account', label: 'Account' }, { key: 'cls', label: 'Class' }, { key: 'description', label: 'Description' }, { key: 'reference', label: 'Reference' }, { key: 'counterparty', label: 'Counterparty' }, { key: 'category', label: 'Category' }, { key: 'currency', label: 'Ccy' }, { key: 'amount', label: 'Amount', kind: 'money', dp: 2 }, { key: 'amount_base', label: `Amount (${base})`, kind: 'money', dp: 2 }, { key: 'bank_ref', label: 'Statement line' }]}
          footer={{ date: 'Total', amount_base: total.toString() }} />
      </Card>
      <Provenance>bank_transactions (immutable statement lines), FX from exchange_rates at the transaction date.</Provenance>
    </div>
  );
}
