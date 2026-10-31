import Link from 'next/link';
import { pageContext, tx, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { trailingMonths } from '@/lib/period';
import { addDays, monthEnd, monthsInRange } from '@/lib/dates';
import { fmtMoney, monthLabel } from '@/lib/format';
import { dec, sum } from '@/lib/money';
import { accountBalances, cashSplit, AMT_BASE, FX_JOIN } from '@/lib/services/treasury';
import { Flash, Provenance } from './_components/flash';

export const dynamic = 'force-dynamic';

const CATS: [string, string][] = [['receipts', 'Customer receipts'], ['settlement', 'Fee sweeps from settlement'], ['payroll', 'Payroll'], ['supplier', 'Supplier payments'], ['tax', 'Taxes'], ['loan', 'Loan repayments'], ['capex', 'Capital expenditure'], ['bank_charges', 'Bank charges'], ['acquirer_fees', 'Acquirer fees'], ['other', 'Other']];
const CLASS_LABEL: Record<string, string> = { operating: 'Operating', restricted: 'Restricted', safeguarded: 'Safeguarded (merchant funds)', merchant_settlement: 'Merchant settlement' };

export default async function CashFlowPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months: allMonths, fyears } = await pageContext(searchParams, 'finance.view');
  const base = auth.baseCurrency;
  const months = (period.months >= 2 ? monthsInRange(period.start, period.end) : trailingMonths(period.end, 12)).slice(-24);
  const from = months[0], to = monthEnd(months[months.length - 1]);
  const data = await tx(auth, async (t) => {
    const flows = await q<{ m: string; cat: string; v: string }>(t, `SELECT date_trunc('month', bt.txn_date)::date::text AS m, coalesce(bt.category,'other') AS cat, sum(${AMT_BASE('$3')})::text AS v
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id ${FX_JOIN('$3')}
      WHERE ba.account_class = 'operating' AND bt.txn_date BETWEEN $1 AND $2 GROUP BY 1, 2`, [from, to, base]);
    const nonOp = await q<{ code: string; m: string; v: string; n: string }>(t, `SELECT ba.code, date_trunc('month', bt.txn_date)::date::text AS m, sum(${AMT_BASE('$3')})::text AS v, count(*)::text AS n
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id ${FX_JOIN('$3')}
      WHERE ba.account_class <> 'operating' AND bt.txn_date BETWEEN $1 AND $2 GROUP BY 1, 2`, [from, to, base]);
    const balAt = [addDays(from, -1), ...months.map((m) => monthEnd(m))];
    const bals = [];
    for (const d of balAt) bals.push({ d, rows: await accountBalances(t, d, base) });
    const recons = await q<{ code: string; period: string; status: string; unresolved_difference: string | null }>(t, `SELECT ba.code, r.period::text, r.status, r.unresolved_difference::text FROM reconciliations r JOIN bank_accounts ba ON ba.id = r.bank_account_id WHERE r.period BETWEEN $1 AND $2`, [months[Math.max(0, months.length - 6)], to]);
    return { flows, nonOp, bals, recons };
  });

  const cell = new Map(data.flows.map((f) => [`${f.cat}|${f.m}`, f.v]));
  const cats = CATS.filter(([k]) => data.flows.some((f) => f.cat === k));
  const extra = [...new Set(data.flows.map((f) => f.cat))].filter((c) => !CATS.some(([k]) => k === c)).map((c) => [c, c] as [string, string]);
  const allCats = [...cats, ...extra];
  const net = months.map((m) => sum(data.flows.filter((f) => f.m === m).map((f) => f.v)));
  const inflow = months.map((m) => sum(data.flows.filter((f) => f.m === m && dec(f.v).gt(0)).map((f) => f.v)));
  const opBal = data.bals.map((b) => cashSplit(b.rows).operating);
  const fxReval = months.map((_, i) => opBal[i + 1].minus(opBal[i]).minus(net[i]));
  const lastSplit = cashSplit(data.bals[data.bals.length - 1].rows);
  const lastRows = data.bals[data.bals.length - 1].rows;
  const totalNet = sum(net);
  const chart = months.map((m, i) => ({ month: monthLabel(m), inflow: inflow[i].toString(), outflow: net[i].minus(inflow[i]).toString(), net: net[i].toString(), closing: opBal[i + 1].toString() }));
  const nonOpAccounts = lastRows.filter((a) => a.account_class !== 'operating');
  const reconMonths = months.slice(-6);
  const operatingAccounts = lastRows.filter((a) => a.account_class === 'operating');

  return (
    <div>
      <PageHeader eyebrow="Treasury" title={`Cash flow analysis — ${monthLabel(from)} to ${monthLabel(months[months.length - 1])}`}
        subtitle={<>Operating cash only, in {base}, from bank statement lines (category per line). Restricted, safeguarded and merchant-settlement accounts are shown separately and are <b>never</b> included in operating cash. A one-month period shows the trailing 12 months.</>}
        actions={<><PeriodFilter current={period.key} months={allMonths} fyears={fyears} allowCompare={false} /><Link className="btn" href="/cash-flow/reconciliation">Bank reconciliation</Link></>} />
      <Flash sp={sp} />
      {lastSplit.missingFx.length > 0 && <Callout tone="warn" title="Missing FX rate">No exchange rate to {base} on or before {to} for: {lastSplit.missingFx.join(', ')}. These balances are excluded from totals.</Callout>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardBody><div className="text-xs text-muted">Operating cash at {to}</div><div className="mt-1 text-xl font-semibold num">{fmtMoney(lastSplit.operating.toString(), base)}</div><div className="text-2xs text-muted">{operatingAccounts.map((a) => a.code).join(' · ')}</div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-muted">Net operating cash flow ({months.length} months)</div><div className={`mt-1 text-xl font-semibold num ${totalNet.lt(0) ? 'text-neg' : 'text-pos'}`}>{fmtMoney(totalNet.toString(), base)}</div><div className="text-2xs text-muted">Average {fmtMoney(totalNet.div(months.length).toString(), base)} / month</div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-muted">Safeguarded + merchant settlement (not MIPS cash)</div><div className="mt-1 text-xl font-semibold num">{fmtMoney(lastSplit.safeguarded.plus(lastSplit.merchantSettlement).toString(), base)}</div><div className="text-2xs text-muted">Held for merchants — excluded</div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-muted">Restricted (guarantees / deposits)</div><div className="mt-1 text-xl font-semibold num">{fmtMoney(lastSplit.restricted.toString(), base)}</div><div className="text-2xs text-muted">Not available for operations — excluded</div></CardBody></Card>
      </div>

      <Section title="Operating cash flow by category">
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th sticky left-0">Category ({base})</th>{months.map((m) => <th key={m} className="th text-right">{monthLabel(m)}</th>)}<th className="th text-right">Total</th></tr></thead>
                <tbody>
                  <tr className="bg-surface-2 font-semibold"><td className="td">Opening operating cash</td>{months.map((m, i) => <td key={m} className="td num text-right">{fmtMoney(opBal[i].toString(), '')}</td>)}<td className="td" /></tr>
                  {allCats.map(([k, label]) => {
                    const vals = months.map((m) => dec(cell.get(`${k}|${m}`) ?? 0));
                    return (
                      <tr key={k} className="hover:bg-surface-2">
                        <td className="td">{label}</td>
                        {months.map((m, i) => <td key={m} className={`td num text-right ${vals[i].lt(0) ? 'text-neg' : ''}`}>{vals[i].isZero() ? <span className="text-muted">—</span> : <Link className="hover:underline" href={`/cash-flow/transactions?class=operating&month=${m.slice(0, 7)}&category=${k}`}>{fmtMoney(vals[i].toString(), '')}</Link>}</td>)}
                        <td className={`td num text-right font-medium ${sum(vals).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(sum(vals).toString(), '')}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold"><td className="td">Net operating cash flow</td>{net.map((v, i) => <td key={i} className={`td num text-right ${v.lt(0) ? 'text-neg' : 'text-pos'}`}><Link className="hover:underline" href={`/cash-flow/transactions?class=operating&month=${months[i].slice(0, 7)}`}>{fmtMoney(v.toString(), '')}</Link></td>)}<td className="td num text-right">{fmtMoney(totalNet.toString(), '')}</td></tr>
                  <tr className="text-muted"><td className="td">FX revaluation (USD account)</td>{fxReval.map((v, i) => <td key={i} className="td num text-right">{v.isZero() ? '—' : fmtMoney(v.toString(), '')}</td>)}<td className="td num text-right">{fmtMoney(sum(fxReval).toString(), '')}</td></tr>
                  <tr className="bg-surface-2 font-semibold"><td className="td">Closing operating cash</td>{months.map((m, i) => <td key={m} className="td num text-right">{fmtMoney(opBal[i + 1].toString(), '')}</td>)}<td className="td" /></tr>
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <Provenance>bank_transactions on accounts with account_class = operating, amounts converted at the latest exchange_rates row on or before each transaction date; closing balances = opening_balance + Σ lines ≤ month end, at the month-end rate (difference shown as FX revaluation). Click a figure to see the statement lines.</Provenance>
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Operating inflows, outflows and net" subtitle={`Monthly, ${base}`} /><CardBody><TrendChart data={chart} x="month" series={[{ key: 'inflow', label: 'Inflows', type: 'bar', color: '#168052' }, { key: 'outflow', label: 'Outflows', type: 'bar', color: '#c43131' }, { key: 'net', label: 'Net', type: 'line', color: '#b8923d' }]} /></CardBody></Card>
        <Card><CardHeader title="Closing operating cash" subtitle={`Month-end, ${base} — excludes restricted, safeguarded and merchant funds`} /><CardBody><TrendChart data={chart} x="month" series={[{ key: 'closing', label: 'Operating cash', type: 'area' }]} /></CardBody></Card>
      </div>

      <Section title="Restricted, safeguarded and merchant-settlement accounts (shown separately — not operating cash)">
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th">Account</th><th className="th">Class</th>{months.map((m) => <th key={m} className="th text-right">{monthLabel(m)}</th>)}<th className="th text-right">Balance {to}</th></tr></thead>
                <tbody>
                  {nonOpAccounts.map((a) => (
                    <tr key={a.code} className="hover:bg-surface-2">
                      <td className="td"><Link className="link" href={`/cash-flow/transactions?account=${a.code}&month=${months[months.length - 1].slice(0, 7)}`}>{a.code}</Link> <span className="text-muted">{a.name}</span></td>
                      <td className="td"><Badge tone={a.account_class === 'restricted' ? 'warn' : 'navy'}>{CLASS_LABEL[a.account_class]}</Badge></td>
                      {months.map((m) => { const r = data.nonOp.find((x) => x.code === a.code && x.m === m); return <td key={m} className={`td num text-right ${r && dec(r.v).lt(0) ? 'text-neg' : ''}`}>{r ? <Link className="hover:underline" href={`/cash-flow/transactions?account=${a.code}&month=${m.slice(0, 7)}`}>{fmtMoney(r.v, '')}</Link> : <span className="text-muted">—</span>}</td>; })}
                      <td className="td num text-right font-medium">{fmtMoney(a.balance_base, '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <Provenance>Monthly net movement per account (bank_transactions). Fee sweeps from MCB-SETTLE to MCB-OPS appear as an outflow here and as an operating inflow above — only the swept fees become MIPS operating cash.</Provenance>
      </Section>

      <Section title={`Account balances at ${to}`}>
        <Card>
          <DataTable filename={`bank-balances-${to}`} searchable={false} rows={lastRows.map((a) => ({ code: a.code, name: a.name, bank: a.bank_name, cls: CLASS_LABEL[a.account_class], operating: a.account_class === 'operating' ? 'yes' : 'no — excluded', currency: a.currency, balance: a.balance, rate: a.rate, rate_date: a.rate_date ?? (a.currency === base ? '—' : 'missing'), balance_base: a.balance_base }))}
            columns={[{ key: 'code', label: 'Account', href: `/cash-flow/transactions?account={code}&month=${months[months.length - 1].slice(0, 7)}` }, { key: 'name', label: 'Name' }, { key: 'bank', label: 'Bank' }, { key: 'cls', label: 'Class' }, { key: 'operating', label: 'In operating cash' }, { key: 'currency', label: 'Ccy' }, { key: 'balance', label: 'Balance (native)', kind: 'money', dp: 2 }, { key: 'rate', label: `Rate to ${base}`, kind: 'number', dp: 4 }, { key: 'rate_date', label: 'Rate date' }, { key: 'balance_base', label: `Balance (${base})`, kind: 'money', dp: 2 }]}
            footer={{ code: 'Operating total', balance_base: lastSplit.operating.toString() }} />
        </Card>
      </Section>

      <Section title="Bank reconciliation status" actions={<Link className="link text-xs" href="/cash-flow/reconciliation">All reconciliations →</Link>}>
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th">Account</th>{reconMonths.map((m) => <th key={m} className="th">{monthLabel(m)}</th>)}</tr></thead>
                <tbody>
                  {lastRows.map((a) => (
                    <tr key={a.code}>
                      <td className="td">{a.code}</td>
                      {reconMonths.map((m) => { const r = data.recons.find((x) => x.code === a.code && x.period === m); return <td key={m} className="td"><Link href={`/cash-flow/reconciliation/${a.code}/${m.slice(0, 7)}`} className="hover:underline">{r ? <StatusBadge status={r.status} /> : <span className="text-muted">not started</span>}</Link>{r?.unresolved_difference && !dec(r.unresolved_difference).isZero() && <span className="ml-1 text-2xs text-warn num">Δ {fmtMoney(r.unresolved_difference, '', { compact: true })}</span>}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </Section>
      <p className="mt-4 text-2xs text-muted">The period filter controls the months shown. Totals use decimal arithmetic on NUMERIC values; charts convert to numbers for plotting only.</p>
    </div>
  );
}
