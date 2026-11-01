import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { parsePeriod } from '@/lib/period';
import { glEntries, plAccounts, departments, productsList, PL_LABEL, PL_BASE, catLabel, seq } from '@/lib/services/finance';
import { PageHeader, Callout, EmptyState } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { FinanceNav, Provenance, Stat } from '../../financial-performance/_components/finance-ui';
import { ParamSelect } from '../../financial-performance/_components/param-select';
import { dec, sum } from '@/lib/money';
import { fmtMoney, fmtNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';
const LIMIT = 2000;

export default async function PnlEntries({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext(searchParams, 'finance.view');
  const { auth, sp, months, fyears } = ctx;
  const period = spGet(sp, 'range') ? ctx.period : parsePeriod('fytd', auth.fyStartMonth);
  const account = spGet(sp, 'account') ?? '';
  const lineRaw = spGet(sp, 'line') ?? '';
  const line = (PL_BASE as readonly string[]).includes(lineRaw) ? lineRaw : '';
  const category = spGet(sp, 'category') ?? '';
  const deptCode = spGet(sp, 'dept') ?? '';
  const prodCode = spGet(sp, 'product') ?? '';

  const data = await tx(auth, async (t) => {
    const [accts, deps, prods] = await seq(() => plAccounts(t), () => departments(t), () => productsList(t));
    const dept = deps.find((d) => d.code === deptCode) ?? null;
    const prod = prods.find((p) => p.code === prodCode) ?? null;
    const acct = accts.find((a) => a.code === account) ?? null;
    const rows = await glEntries(t, period.start, period.end, { accountCode: acct?.code, plLine: acct ? undefined : line || undefined, costCategory: acct || line ? undefined : category || undefined }, { departmentId: dept?.id, productId: prod?.id }, LIMIT + 1);
    return { accts, deps, prods, dept, prod, acct, rows };
  });
  const { accts, deps, prods, acct, rows } = data;
  const truncated = rows.length > LIMIT;
  const shown = rows.slice(0, LIMIT);
  const title = acct ? `${acct.code} ${acct.name}` : line ? `${PL_LABEL[line]} — all accounts` : category ? `${catLabel(category)} — cost category` : 'All P&L accounts';
  const totals = { debit: sum(shown.map((r) => r.debit_base)), credit: sum(shown.map((r) => r.credit_base)), natural: sum(shown.map((r) => r.natural)) };
  const batches = Array.from(new Map(shown.filter((r) => r.import_batch_id).map((r) => [r.import_batch_id!, r.batch_filename])).entries());
  const adjustments = shown.filter((r) => r.is_adjustment);
  const sources = Array.from(new Set(shown.map((r) => r.source_system)));
  const back = new URLSearchParams({ range: period.key }); if (deptCode) back.set('dept', deptCode); if (prodCode) back.set('product', prodCode);

  return (
    <div>
      <PageHeader eyebrow="Profit & Loss · drill-down" title={title}
        subtitle={<>Journal lines from <code>gl_entries</code> for {period.label}{data.dept ? ` · department ${data.dept.name}` : ''}{data.prod ? ` · product ${data.prod.name}` : ''}. GL entries are immutable (DB trigger); corrections appear as separate adjustment journals.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      <FinanceNav current="/pnl" range={period.key} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link className="link text-sm" href={`/pnl?${back.toString()}`}>← Back to P&L</Link>
        <ParamSelect name="account" label="Account" value={acct?.code ?? ''} clear={['line', 'category']} options={[{ value: '', label: line ? `All ${PL_LABEL[line]} accounts` : 'All P&L accounts' }, ...accts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))]} />
        <ParamSelect name="dept" label="Department" value={deptCode} options={[{ value: '', label: 'All departments' }, ...deps.map((d) => ({ value: d.code, label: d.name }))]} />
        <ParamSelect name="product" label="Product" value={prodCode} options={[{ value: '', label: 'All products' }, ...prods.map((p) => ({ value: p.code, label: p.name }))]} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Entries" value={fmtNumber(shown.length)} sub={truncated ? `first ${LIMIT} shown — narrow the range` : sources.join(', ') || '—'} />
        <Stat label="Σ Debit (base)" value={fmtMoney(totals.debit.toString(), auth.baseCurrency, { dp: 2 })} />
        <Stat label="Σ Credit (base)" value={fmtMoney(totals.credit.toString(), auth.baseCurrency, { dp: 2 })} />
        <Stat label={acct && ['revenue', 'finance_income'].includes(acct.pl_line) || line === 'revenue' || line === 'finance_income' ? 'Net (credit − debit)' : 'Net in natural sign'} value={fmtMoney(totals.natural.toString(), auth.baseCurrency, { dp: 2 })} sub="matches the P&L cell for the same range and filters" />
      </div>

      {acct && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="navy">{acct.account_type}</Badge><Badge>P&L line: {PL_LABEL[acct.pl_line]}</Badge>
          {acct.cost_category && <Badge>category: {catLabel(acct.cost_category)}</Badge>}{acct.cost_behaviour && <Badge>{acct.cost_behaviour}</Badge>}{acct.revenue_stream && <Badge tone="gold">stream {acct.revenue_stream}</Badge>}
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Callout tone={batches.length ? 'info' : 'warn'} title={batches.length ? `${batches.length} import batch(es) behind these entries` : 'No import batch attached to these entries'}>
          {batches.length ? batches.map(([id, fn]) => <div key={id}><Link className="link" href={`/proof?batch=${id}`}>{fn ?? id.slice(0, 8)}</Link> — evidence in the Financial Proof Center</div>)
            : <>Entries were posted by: <b>{sources.join(', ') || '—'}</b>. There is no source-file evidence to link; see <Link className="link" href={`/proof/kpi/FIN.REVENUE?range=${encodeURIComponent(period.key)}`}>KPI proof</Link> for the calculation trail.</>}
        </Callout>
        <Callout tone={adjustments.length ? 'warn' : 'pos'} title={adjustments.length ? `${adjustments.length} adjustment line(s)` : 'No manual adjustments in this selection'}>
          {adjustments.length ? adjustments.slice(0, 5).map((a) => <div key={a.id} className="num">{a.journal_ref}/{a.line_no} {a.adjustment_ref ?? ''} {fmtMoney(a.natural, auth.baseCurrency, { dp: 2 })}</div>) : 'All lines originate from system postings.'}
        </Callout>
      </div>

      <Card className="mt-4">
        <CardHeader title="Journal lines" subtitle="Amounts in transaction currency and base currency. CSV export includes all filtered rows." />
        {shown.length === 0 ? <CardBody><EmptyState title="No GL entries">No entries match this account, range and filter.</EmptyState></CardBody> : (
          <DataTable filename={`gl-${acct?.code ?? line ?? 'pl'}-${period.key.replace(/[:.]/g, '_')}`} rows={shown.map((r) => ({ ...r, adj: r.is_adjustment ? 'adjustment' : '', batch: r.batch_filename ?? (r.import_batch_id ? r.import_batch_id.slice(0, 8) : '') }))} pageSize={50} dense columns={[
            { key: 'entry_date', label: 'Date', kind: 'date' },
            { key: 'journal_ref', label: 'Journal' },
            { key: 'line_no', label: 'Line', kind: 'number' },
            { key: 'account_code', label: 'Account' },
            { key: 'description', label: 'Description' },
            { key: 'currency', label: 'Ccy' },
            { key: 'debit', label: 'Debit', kind: 'money', dp: 2 },
            { key: 'credit', label: 'Credit', kind: 'money', dp: 2 },
            { key: 'debit_base', label: `Debit ${auth.baseCurrency}`, kind: 'money', dp: 2 },
            { key: 'credit_base', label: `Credit ${auth.baseCurrency}`, kind: 'money', dp: 2 },
            { key: 'department', label: 'Dept' },
            { key: 'product', label: 'Product' },
            { key: 'source_system', label: 'Source system' },
            { key: 'batch', label: 'Import batch' },
            { key: 'adj', label: 'Adjustment', kind: 'badge' },
          ]} footer={{ debit_base: totals.debit.toString(), credit_base: totals.credit.toString() }} />
        )}
      </Card>
      <Provenance>Natural sign: income accounts credit − debit, expense accounts debit − credit. Σ net here = {fmtMoney(totals.natural.toString(), auth.baseCurrency, { dp: 2 })} {dec(totals.debit).isZero() && dec(totals.credit).isZero() ? '' : `(${shown.length} lines)`}. Source: gl_entries ⨝ chart_of_accounts ⟕ import_batches ⟕ adjustments.</Provenance>
    </div>
  );
}
