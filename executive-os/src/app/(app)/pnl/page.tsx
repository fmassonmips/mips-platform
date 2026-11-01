import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { parsePeriod } from '@/lib/period';
import { runChecks } from '@/lib/services/checks';
import { buildPnl, departments, productsList, materialityPct, type PlView, type PnlRow, seq } from '@/lib/services/finance';
import { PageHeader, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FinanceNav, Amt, VarAmt, PpDelta, Provenance } from '../financial-performance/_components/finance-ui';
import { ParamSelect } from '../financial-performance/_components/param-select';
import { fmtMoney, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { monthEnd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function PnlPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext(searchParams, 'finance.view');
  const { auth, sp, months, fyears } = ctx;
  const period = spGet(sp, 'range') ? ctx.period : parsePeriod('fytd', auth.fyStartMonth);
  const view: PlView = (['monthly', 'quarterly', 'annual'] as const).find((v) => v === spGet(sp, 'view')) ?? 'monthly';
  const deptCode = spGet(sp, 'dept') ?? '';
  const prodCode = spGet(sp, 'product') ?? '';
  const showAccounts = spGet(sp, 'accounts') !== 'hide';

  const data = await tx(auth, async (t) => {
    const [deps, prods] = await seq(() => departments(t), () => productsList(t));
    const dept = deps.find((d) => d.code === deptCode) ?? null;
    const prod = prods.find((p) => p.code === prodCode) ?? null;
    const pnl = await buildPnl(t, { start: period.start, end: period.end, view, fyStart: auth.fyStartMonth, filter: { departmentId: dept?.id, productId: prod?.id }, materialityPct: materialityPct(auth.settings) });
    const checks = await runChecks(t, pnl.start, pnl.end);
    return { deps, prods, dept, prod, pnl, c07: checks.find((c) => c.code === 'C07') ?? null };
  });
  const { pnl, deps, prods, dept, prod, c07 } = data;
  const filtered = Boolean(dept || prod);
  const qs = (extra: Record<string, string>) => { const p = new URLSearchParams({ range: period.key }); if (deptCode) p.set('dept', deptCode); if (prodCode) p.set('product', prodCode); for (const [k, v] of Object.entries(extra)) p.set(k, v); return p.toString(); };
  const rows = pnl.rows.filter((r) => showAccounts || r.kind !== 'account');
  const firstMonth = months[0] ?? period.start;
  const lastMonth = months[months.length - 1] ?? period.end;

  const cell = (r: PnlRow, v: string | null) => (r.kind === 'margin' ? <span className="num">{fmtPct(v)}</span> : <Amt v={v} />);
  const label = (r: PnlRow) => {
    if (r.kind === 'account') return <Link className="link" href={`/pnl/entries?${qs({ account: r.accountCode! })}`}>{r.label}</Link>;
    if (r.kind === 'margin') return <span className="italic text-muted">{r.label}</span>;
    if (r.kind === 'base') return <Link className="link font-medium" href={`/pnl/entries?${qs({ line: r.line })}`}>{r.label}</Link>;
    return <span className="font-semibold">{r.label}</span>;
  };

  return (
    <div>
      <PageHeader eyebrow="Finance" title={`Profit & Loss — ${period.label}`}
        subtitle={<>Statement built from <b>gl_entries</b> mapped through the chart of accounts (<code>pl_line</code>). Income lines = credit − debit; expense lines = debit − credit; base currency {auth.baseCurrency}. Fiscal year starts month {auth.fyStartMonth}.</>}
        actions={<>
          <PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />
          <a className="btn py-1 text-xs" href={`/pnl/export?${qs({ view })}`}>Export XLSX</a>
        </>} />
      <FinanceNav current="/pnl" range={period.key} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ParamSelect name="view" label="View" value={view} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly (fiscal)' }, { value: 'annual', label: 'Annual (fiscal year)' }]} />
        <ParamSelect name="dept" label="Department" value={deptCode} options={[{ value: '', label: 'All departments' }, ...deps.map((d) => ({ value: d.code, label: d.name }))]} />
        <ParamSelect name="product" label="Product" value={prodCode} options={[{ value: '', label: 'All products' }, ...prods.map((p) => ({ value: p.code, label: p.name }))]} />
        <ParamSelect name="accounts" label="Accounts" value={showAccounts ? '' : 'hide'} options={[{ value: '', label: 'Show account rows' }, { value: 'hide', label: 'Lines only' }]} />
        <Link className="link text-xs" href={`/pnl?${new URLSearchParams({ range: `c:${firstMonth}..${monthEnd(lastMonth)}`, view: 'annual' }).toString()}`}>All fiscal years with data →</Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {c07 && c07.status === 'fail' && (
          <Callout tone="neg" title="DISPUTED — GL revenue does not reconcile to the transaction fee engine (control C07)">
            {c07.detail}. {c07.samples.map((x) => <div key={x} className="num">{x}</div>)}
            GL figures for these months are shown as booked and are <b>not</b> adjusted here; a correcting journal must be posted. <Link className="link" href={`/proof/kpi/FIN.REVENUE?range=${encodeURIComponent(period.key)}`}>Revenue proof →</Link>
          </Callout>
        )}
        <Callout tone={pnl.recon.ok ? 'pos' : 'neg'} title={pnl.recon.ok ? 'Reconciled: statement net profit = Σ GL P&L accounts' : 'Reconciliation break: statement ≠ Σ GL P&L accounts'}>
          Statement net profit <b className="num">{fmtMoney(pnl.recon.statementNet, auth.baseCurrency, { dp: 2 })}</b> · Σ (credit − debit) over {pnl.recon.entries} entries on P&L-mapped accounts <b className="num">{fmtMoney(pnl.recon.glNet, auth.baseCurrency, { dp: 2 })}</b> · difference <b className="num">{fmtMoney(pnl.recon.difference, auth.baseCurrency, { dp: 2 })}</b>.
          {!filtered && <> Journals in range {pnl.recon.balanced ? 'balance' : <b className="text-neg">do NOT balance</b>} (Σ debit {fmtMoney(pnl.recon.debits, auth.baseCurrency)} = Σ credit {fmtMoney(pnl.recon.credits, auth.baseCurrency)}).</>}
          {pnl.recon.unmappedEntries !== '0' && <div className="text-warn">{pnl.recon.unmappedEntries} entries on revenue/expense accounts without a P&L mapping (net {fmtMoney(pnl.recon.unmappedNet)}) are excluded — map them in the chart of accounts.</div>}
        </Callout>
        {pnl.truncatedFrom && (
          <Callout tone="info" title={`Actuals end ${pnl.end}: range capped at the last month with GL postings`}>The selected range runs to {pnl.truncatedFrom}; budget and prior-year comparisons use the same {pnl.budget.totalMonths} booked month(s) so that variances compare like with like. Full-year outlook: <Link className="link" href="/budget">Budget & Forecast</Link>.</Callout>
        )}
        {filtered && (
          <Callout tone="info" title={`Filtered view: ${[dept?.name, prod?.name].filter(Boolean).join(' · ')}`}>
            Only GL entries tagged with this {dept && prod ? 'department and product' : dept ? 'department' : 'product'} are included. Untagged entries (e.g. company-level overheads) are excluded{pnl.budget.coveredMonths === 0 ? '; no budget lines are held at this dimension, so the budget columns are empty' : ''}.
          </Callout>
        )}
        {pnl.budget.coveredMonths < pnl.budget.totalMonths && pnl.budget.coveredMonths > 0 && (
          <Callout tone="warn" title={`Budget covers ${pnl.budget.coveredMonths} of ${pnl.budget.totalMonths} months in this range`}>Budget comparisons cover only the budgeted months; the actual total includes all months.</Callout>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader title={`Income statement (${auth.baseCurrency}) — ${view} view`}
          subtitle={<>Budget: {pnl.budget.versions.length ? pnl.budget.versions.map((v, i) => <span key={v.id}>{i > 0 && ', '}<Link className="link" href={`/budget/${v.id}`}>{v.name}</Link></span>) : 'no approved budget for this range'} · Prior year: {pnl.pyRange.start} → {pnl.pyRange.end} · Material variance ≥ {pnl.materiality}% flagged <Badge tone="warn">M</Badge></>} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th sticky left-0 z-10 min-w-[220px]">Line</th>
                {pnl.buckets.map((b) => <th key={b.key} className="th text-right" title={b.months.join(', ')}>{b.label}{b.partial ? '*' : ''}</th>)}
                <th className="th text-right">Total</th>
                <th className="th text-right">Budget</th>
                <th className="th text-right">Var</th>
                <th className="th text-right">Var %</th>
                <th className="th text-right">Prior year</th>
                <th className="th text-right">Δ PY %</th>
                <th className="th">Proof</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn('hover:bg-surface-2', r.kind === 'subtotal' && 'bg-surface-2/60 font-semibold', r.kind === 'account' && 'text-xs')}>
                  <td className={cn('td sticky left-0 z-10 bg-surface', r.kind === 'account' && 'pl-7', r.kind === 'margin' && 'pl-5', r.kind === 'subtotal' && 'bg-surface-2')}>{label(r)}</td>
                  {r.cells.map((c, i) => <td key={i} className="td text-right">{cell(r, c)}</td>)}
                  <td className="td text-right font-medium">{cell(r, r.total)}</td>
                  <td className="td text-right">{cell(r, r.budget)}</td>
                  <td className="td text-right">{r.kind === 'margin' ? <PpDelta v={r.varAbs} favourable={r.favourable} /> : <VarAmt v={r.varAbs} favourable={r.favourable} />}</td>
                  <td className="td text-right">{r.kind === 'margin' ? '' : <><VarAmt v={r.varPct} favourable={r.favourable} pct />{r.material && <Badge tone="warn" className="ml-1">M</Badge>}</>}</td>
                  <td className="td text-right">{cell(r, r.py)}</td>
                  <td className="td text-right">{r.kind === 'margin' ? <PpDelta v={r.pyAbs} favourable={r.pyFavourable} /> : <VarAmt v={r.pyPct} favourable={r.pyFavourable} pct />}</td>
                  <td className="td text-xs">{r.kpi && <Link className="link" href={`/proof/kpi/${encodeURIComponent(r.kpi)}?range=${encodeURIComponent(period.key)}`}>{r.kpi}</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="pt-2">
          <Provenance>
            * partial bucket (fewer months than the full {view === 'quarterly' ? 'quarter' : view === 'annual' ? 'fiscal year' : 'month'} inside the selected range). Variances: actual − budget; green = favourable (income above / cost below plan). Subtotals for the budget are shown only when every component line is budgeted (D&A, finance and tax are not budgeted in the demo, so budgeted operating profit and below are “—”).
            Source: <code>gl_entries ⨝ chart_of_accounts</code> (pl_line, accounting period); budget: <code>budget_lines</code> of the approved <i>budget</i> version for each month’s fiscal year. Click a line or account to drill down to the journal entries.
          </Provenance>
        </CardBody>
      </Card>
    </div>
  );
}
