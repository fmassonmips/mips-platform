import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { todayISO } from '@/lib/period';
import { addDays } from '@/lib/dates';
import { fmtMoney, fmtPct } from '@/lib/format';
import { dec, sum } from '@/lib/money';
import { forecast13w, collectionDelaySensitivity, FORECAST_CATEGORIES, DEFAULT_SCENARIOS, type ForecastCategory } from '@/lib/engine/cashforecast';
import { forecastInputs, nextMondayAfter, scenariosFromParams, tenantMinimumLiquidity } from '@/lib/services/treasury';
import { Flash, ReturnTo, currentUrl, Provenance } from '../cash-flow/_components/flash';
import { createForecastItemAction, updateForecastItemAction, deleteForecastItemAction } from './actions';

export const dynamic = 'force-dynamic';

const CAT_LABEL: Record<ForecastCategory, string> = {
  customer_receipts: 'Customer receipts', merchant_obligations: 'Merchant-related obligations', payroll: 'Payroll', supplier_payments: 'Supplier payments', taxes: 'Taxes',
  regulatory: 'Regulatory', loan_repayments: 'Loan repayments', capex: 'Capital expenditure', other_in: 'Other inflows', other_out: 'Other outflows',
};

export default async function TreasuryForecastPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'finance.view');
  const base = auth.baseCurrency;
  const today = todayISO();
  const asOf = period.end < today ? period.end : today;
  const start = nextMondayAfter(asOf);
  const minL = tenantMinimumLiquidity(auth);
  const scenarios = scenariosFromParams((k) => spGet(sp, k));
  const view = scenarios.find((s) => s.key === spGet(sp, 'view'))?.key ?? 'base';
  const editId = spGet(sp, 'edit');
  const inp = await tx(auth, (t) => forecastInputs(t, asOf, base));
  const opening = inp.split.operating;
  const params = {
    startWeek: start, openingCash: opening, minimumLiquidity: minL,
    receivables: inp.receivables.map((r) => ({ id: r.id, dueDate: r.due_date, outstanding: r.outstanding_base, disputed: r.disputed, promiseDate: r.promise_date })),
    payables: inp.payables.map((p) => ({ id: p.id, dueDate: p.due_date, scheduledDate: p.scheduled_date, amount: p.amount_base, status: p.status, priority: p.priority })),
    items: inp.items.map((i) => ({ category: i.category as ForecastCategory, description: i.description, amount: i.amount_base, recurrence: i.recurrence, startDate: i.start_date, endDate: i.end_date, dayOfMonth: i.day_of_month })),
  };
  const results = scenarios.map((s) => forecast13w({ ...params, scenario: s }));
  const sel = results.find((r) => r.scenario === view)!;
  const selScenario = scenarios.find((s) => s.key === view)!;
  const sens = collectionDelaySensitivity({ ...params, scenario: selScenario });
  const chart = sel.weeks.map((w, i) => ({ week: w.weekStart.slice(5), ...Object.fromEntries(results.map((r) => [r.scenario, r.weeks[i].closing.toString()])) }));
  const usedCats = FORECAST_CATEGORIES.filter((c) => results.some((r) => r.weeks.some((w) => !w.flows[c].isZero())));
  const here = currentUrl('/treasury-forecast', sp);
  const canManage = auth.permissions.has('finance.manage');
  const editItem = editId ? inp.items.find((i) => i.id === editId) : undefined;
  const arTotal = sum(inp.receivables.map((r) => r.outstanding_base));
  const disputed = sum(inp.receivables.filter((r) => r.disputed).map((r) => r.outstanding_base));
  const apTotal = sum(inp.payables.map((p) => p.amount_base));
  const onHold = sum(inp.payables.filter((p) => p.status === 'on_hold').map((p) => p.amount_base));
  const keepParams = Object.fromEntries(Object.entries(sp).filter(([k]) => /^(base|optimistic|pessimistic)_/.test(k) || k === 'range'));
  const viewHref = (v: string) => `/treasury-forecast?${new URLSearchParams({ ...(keepParams as Record<string, string>), view: v })}`;

  return (
    <div>
      <PageHeader eyebrow="Treasury" title={`Rolling 13-week cash forecast from ${start}`}
        subtitle={<>Opening = operating cash at {asOf} ({base}; FX from exchange_rates). Receipts from open customer invoices (due or promise date, scenario delay and collection rate; disputed invoices at the disputed rate), unpaid supplier invoices (scheduled or due date), and recurring forecast items. Weeks start on Mondays; overdue items fall in week 1.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      <Flash sp={sp} />
      <Callout tone="info" title="Restricted, safeguarded and merchant funds are excluded">
        Opening cash includes only operating accounts ({inp.balances.filter((a) => a.account_class === 'operating').map((a) => a.code).join(', ')}): {fmtMoney(opening.toString(), base)}. Excluded: safeguarded {fmtMoney(inp.split.safeguarded.toString(), base)}, merchant settlement {fmtMoney(inp.split.merchantSettlement.toString(), base)}, restricted {fmtMoney(inp.split.restricted.toString(), base)}. Merchant money is never used to fund MIPS outflows in this forecast.
        {inp.split.missingFx.length > 0 && <> Missing FX for {inp.split.missingFx.join(', ')} — excluded.</>}
      </Callout>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {results.map((r) => (
          <Link key={r.scenario} href={viewHref(r.scenario)} className={`card block p-3 ${r.scenario === view ? 'ring-2 ring-gold' : ''}`}>
            <div className="flex items-center justify-between text-xs text-muted"><span className="capitalize">{r.scenario} scenario</span>{r.liquidityGapWeeks.length > 0 ? <Badge tone="neg">{r.liquidityGapWeeks.length} gap week(s)</Badge> : <Badge tone="pos">no gap</Badge>}</div>
            <div className="mt-1 text-lg font-semibold num">{fmtMoney(r.weeks[12].closing.toString(), base, { compact: true })}</div>
            <div className="text-2xs text-muted">closing week 13 · minimum {fmtMoney(r.minClosing.toString(), base, { compact: true })} (w/c {r.minWeek})</div>
          </Link>
        ))}
        <div className="card p-3"><div className="text-xs text-muted">Minimum liquidity (tenant setting)</div><div className="mt-1 text-lg font-semibold num">{fmtMoney(minL, base, { compact: true })}</div><div className="text-2xs text-muted">settings.minimum_liquidity · <Link className="link" href="/liquidity">regulatory floors →</Link></div></div>
        <div className="card p-3"><div className="text-xs text-muted">Inputs at {asOf}</div><div className="mt-1 text-sm num">AR {fmtMoney(arTotal.toString(), base, { compact: true })} ({inp.receivables.length}) · disputed {fmtMoney(disputed.toString(), base, { compact: true })}</div><div className="text-sm num">AP {fmtMoney(apTotal.toString(), base, { compact: true })} ({inp.payables.length}){onHold.gt(0) && ` · on hold ${fmtMoney(onHold.toString(), base, { compact: true })}`}</div><div className="text-2xs text-muted">{inp.items.length} forecast item(s)</div></div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader title="Closing operating cash by week — three scenarios" subtitle={`Dashed line = minimum liquidity ${fmtMoney(minL, base, { compact: true })}`} /><CardBody><TrendChart data={chart} x="week" refLine={Number(minL)} series={[{ key: 'base', label: 'Base', type: 'line' }, { key: 'optimistic', label: 'Optimistic', type: 'line', color: '#168052' }, { key: 'pessimistic', label: 'Pessimistic', type: 'line', color: '#c43131' }]} /></CardBody></Card>
        <Card>
          <CardHeader title="Scenario assumptions" subtitle="Edit and apply (query parameters). Defaults: engine DEFAULT_SCENARIOS." />
          <CardBody>
            <form method="get" className="space-y-2 text-xs">
              <input type="hidden" name="range" value={period.key} /><input type="hidden" name="view" value={view} />
              <table className="w-full"><thead><tr><th className="th">Param</th>{scenarios.map((s) => <th key={s.key} className="th capitalize">{s.key}</th>)}</tr></thead>
                <tbody>
                  {([['delay', 'Receipt delay (days)', 'receiptDelayDays'], ['rate', 'Collection rate (0–1)', 'collectionRate'], ['drate', 'Disputed collection rate', 'disputedCollectionRate'], ['out', 'Outflow factor (items)', 'outflowFactor']] as const).map(([k, label, field]) => (
                    <tr key={k}><td className="td py-1">{label}</td>{scenarios.map((s) => <td key={s.key} className="td py-1"><input className="input w-20 py-0.5 text-xs" name={`${s.key}_${k}`} defaultValue={String(s[field])} inputMode="decimal" aria-label={`${s.key} ${label}`} /></td>)}</tr>
                  ))}
                </tbody></table>
              <div className="flex gap-2"><button className="btn-primary py-1 text-xs">Apply</button><Link className="btn py-1 text-xs" href={`/treasury-forecast?range=${encodeURIComponent(period.key)}`}>Reset to defaults</Link></div>
              <p className="text-2xs text-muted">Defaults: {DEFAULT_SCENARIOS.map((s) => `${s.key} ${s.receiptDelayDays}d / ${fmtPct(dec(s.collectionRate).toString(), 0)}`).join(' · ')}. Outflow factor scales recurring outflow items only.</p>
            </form>
          </CardBody>
        </Card>
      </div>

      <Section title={`Week grid — ${view} scenario`} actions={<div className="flex gap-1 text-xs">{scenarios.map((s) => <Link key={s.key} href={viewHref(s.key)} className={`btn py-1 text-xs capitalize ${s.key === view ? 'ring-2 ring-gold' : ''}`}>{s.key}</Link>)}</div>}>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className="th sticky left-0">{base}</th>{sel.weeks.map((w) => <th key={w.weekStart} className="th text-right">w/c {w.weekStart.slice(5)}</th>)}<th className="th text-right">13 weeks</th></tr></thead>
              <tbody>
                <tr className="bg-surface-2 font-semibold"><td className="td">Opening cash</td>{sel.weeks.map((w) => <td key={w.weekStart} className="td num text-right">{fmtMoney(w.opening.toString(), '')}</td>)}<td className="td" /></tr>
                {usedCats.map((c) => { const tot = sum(sel.weeks.map((w) => w.flows[c])); return (
                  <tr key={c} className="hover:bg-surface-2"><td className="td">{CAT_LABEL[c]}</td>{sel.weeks.map((w) => <td key={w.weekStart} className={`td num text-right ${w.flows[c].lt(0) ? 'text-neg' : ''}`}>{w.flows[c].isZero() ? <span className="text-muted">—</span> : fmtMoney(w.flows[c].toString(), '')}</td>)}<td className={`td num text-right font-medium ${tot.lt(0) ? 'text-neg' : ''}`}>{fmtMoney(tot.toString(), '')}</td></tr>
                ); })}
                <tr><td className="td">Total inflows</td>{sel.weeks.map((w) => <td key={w.weekStart} className="td num text-right text-pos">{fmtMoney(w.inflows.toString(), '')}</td>)}<td className="td num text-right">{fmtMoney(sel.totalIn.toString(), '')}</td></tr>
                <tr><td className="td">Total outflows</td>{sel.weeks.map((w) => <td key={w.weekStart} className="td num text-right text-neg">{fmtMoney(w.outflows.toString(), '')}</td>)}<td className="td num text-right">{fmtMoney(sel.totalOut.toString(), '')}</td></tr>
                <tr className="font-semibold"><td className="td">Net cash flow</td>{sel.weeks.map((w) => <td key={w.weekStart} className={`td num text-right ${w.net.lt(0) ? 'text-neg' : ''}`}>{fmtMoney(w.net.toString(), '')}</td>)}<td className="td num text-right">{fmtMoney(sel.totalIn.plus(sel.totalOut).toString(), '')}</td></tr>
                <tr className="bg-surface-2 font-semibold"><td className="td">Closing cash</td>{sel.weeks.map((w) => <td key={w.weekStart} className={`td num text-right ${w.belowMinimum ? 'bg-neg/15 text-neg' : ''}`} title={w.belowMinimum ? 'Below minimum liquidity' : undefined}>{fmtMoney(w.closing.toString(), '')}</td>)}<td className="td" /></tr>
                <tr className="text-muted"><td className="td">Headroom vs minimum</td>{sel.weeks.map((w) => { const h = w.closing.minus(minL); return <td key={w.weekStart} className={`td num text-right ${h.lt(0) ? 'text-neg font-semibold' : ''}`}>{fmtMoney(h.toString(), '')}</td>; })}<td className="td" /></tr>
              </tbody>
            </table>
          </div>
        </Card>
        {sel.liquidityGapWeeks.length > 0 ? <div className="mt-2"><Callout tone="neg" title={`Liquidity gap: closing cash below minimum in ${sel.liquidityGapWeeks.length} week(s)`}>Weeks commencing {sel.liquidityGapWeeks.join(', ')}. Lowest point {fmtMoney(sel.minClosing.toString(), base)} in w/c {sel.minWeek}.</Callout></div> : <p className="mt-2 text-xs text-pos">No week falls below the minimum liquidity threshold in the {view} scenario.</p>}
        <Provenance>engine cashforecast.forecast13w; customer_invoices (outstanding × fx_rate_to_base), supplier_invoices (status not paid/rejected, incl. on hold), cash_forecast_items. Supplier payments include only invoices already received — expected future supplier invoices must be added as forecast items.</Provenance>
      </Section>

      <Section title={`Sensitivity to collection delays — ${view} scenario`}>
        <Card>
          <table className="w-full border-collapse text-sm">
            <thead><tr><th className="th">Additional delay</th><th className="th text-right">Total receipt delay</th><th className="th text-right">Minimum closing cash</th><th className="th">Week of minimum</th><th className="th text-right">Week-13 closing</th><th className="th text-right">Weeks below minimum</th></tr></thead>
            <tbody>{sens.map((s) => <tr key={s.extraDelayDays}><td className="td">+{s.extraDelayDays} days</td><td className="td num text-right">{selScenario.receiptDelayDays + s.extraDelayDays} d</td><td className={`td num text-right ${s.minClosing.lt(minL) ? 'text-neg font-semibold' : ''}`}>{fmtMoney(s.minClosing.toString(), base)}</td><td className="td">{s.minWeek}</td><td className="td num text-right">{fmtMoney(s.endCash.toString(), base)}</td><td className={`td num text-right ${s.gapWeeks > 0 ? 'text-neg' : ''}`}>{s.gapWeeks}</td></tr>)}</tbody>
          </table>
        </Card>
        <Provenance>engine cashforecast.collectionDelaySensitivity — the scenario re-run with receipt delays extended by 0/15/30/45/60 days.</Provenance>
      </Section>

      <Section title={`Forecast items (${inp.items.length})`}>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className="th">Category</th><th className="th">Description</th><th className="th text-right">Amount ({base})</th><th className="th">Recurrence</th><th className="th">Start</th><th className="th">End</th><th className="th">Day</th><th className="th">Created by</th>{canManage && <th className="th no-print">Action</th>}</tr></thead>
              <tbody>{inp.items.map((i) => (
                <tr key={i.id} className={i.id === editId ? 'bg-gold-soft' : ''}>
                  <td className="td">{CAT_LABEL[i.category as ForecastCategory] ?? i.category}</td><td className="td whitespace-normal">{i.description}{i.is_demo && <span className="ml-1 text-2xs text-muted">(demo)</span>}</td>
                  <td className={`td num text-right ${dec(i.amount_base).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(i.amount_base, '', { dp: 2 })}</td><td className="td">{i.recurrence}</td><td className="td">{i.start_date}</td><td className="td">{i.end_date ?? '—'}</td><td className="td">{i.day_of_month ?? '—'}</td><td className="td">{i.created_by_name ?? '—'}</td>
                  {canManage && <td className="td no-print"><div className="flex gap-1"><Link className="btn py-1 text-xs" href={currentUrl('/treasury-forecast', sp, { edit: i.id }) + '#item-form'}>Edit</Link><form action={deleteForecastItemAction}><ReturnTo value={currentUrl('/treasury-forecast', sp, { edit: null })} /><input type="hidden" name="id" value={i.id} /><button className="btn-danger py-1 text-xs">Delete</button></form></div></td>}
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
        {canManage ? (
          <Card className="mt-3" id="item-form">
            <CardHeader title={editItem ? `Edit forecast item — ${editItem.description}` : 'Add forecast item'} subtitle="Signed amount in base currency: positive = inflow, negative = outflow. Requires finance.manage; every change is audited." actions={editItem ? <Link className="link text-xs" href={currentUrl('/treasury-forecast', sp, { edit: null })}>Cancel edit</Link> : undefined} />
            <CardBody>
              <form action={editItem ? updateForecastItemAction : createForecastItemAction} className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
                <ReturnTo value={currentUrl('/treasury-forecast', sp, { edit: null })} />
                {editItem && <input type="hidden" name="id" value={editItem.id} />}
                <div><label className="label" htmlFor="category">Category</label><select id="category" name="category" className="input" defaultValue={editItem?.category ?? 'other_out'}>{FORECAST_CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></div>
                <div className="md:col-span-2"><label className="label" htmlFor="description">Description</label><input id="description" name="description" className="input" required minLength={3} maxLength={200} defaultValue={editItem?.description} /></div>
                <div><label className="label" htmlFor="amount">Amount ({base})</label><input id="amount" name="amount" className="input" required inputMode="decimal" placeholder="-150000" defaultValue={editItem ? dec(editItem.amount_base).toString() : ''} /></div>
                <div><label className="label" htmlFor="recurrence">Recurrence</label><select id="recurrence" name="recurrence" className="input" defaultValue={editItem?.recurrence ?? 'once'}><option value="once">Once</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
                <div><label className="label" htmlFor="start_date">Start / date</label><input id="start_date" name="start_date" type="date" className="input" required defaultValue={editItem?.start_date ?? start} /></div>
                <div><label className="label" htmlFor="end_date">End (optional)</label><input id="end_date" name="end_date" type="date" className="input" defaultValue={editItem?.end_date ?? ''} /></div>
                <div><label className="label" htmlFor="day_of_month">Day of month</label><input id="day_of_month" name="day_of_month" className="input" inputMode="numeric" placeholder="monthly only" defaultValue={editItem?.day_of_month ?? ''} /></div>
                <div className="md:col-span-4 xl:col-span-8"><button className="btn-primary">{editItem ? 'Save changes' : 'Add item'}</button></div>
              </form>
            </CardBody>
          </Card>
        ) : <p className="mt-2 text-xs text-muted">Editing forecast items requires finance.manage.</p>}
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Open receivables feeding the forecast (${inp.receivables.length})`} actions={<Link className="link text-xs" href="/receivables">Receivables →</Link>} />
          <DataTable filename="forecast-receivables" pageSize={10} rows={inp.receivables.map((r) => ({ ...r, disputed: r.disputed ? 'disputed' : '', expected: addDays(r.promise_date && r.promise_date > r.due_date ? r.promise_date : r.due_date, selScenario.receiptDelayDays) }))}
            columns={[{ key: 'number', label: 'Invoice', href: '/receivables/{id}' }, { key: 'merchant', label: 'Customer' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'promise_date', label: 'Promise', kind: 'date' }, { key: 'expected', label: `Expected (${view})`, kind: 'date' }, { key: 'disputed', label: 'Dispute' }, { key: 'outstanding_base', label: 'Outstanding', kind: 'money' }]} />
        </Card>
        <Card>
          <CardHeader title={`Unpaid supplier invoices feeding the forecast (${inp.payables.length})`} actions={<Link className="link text-xs" href="/suppliers">Supplier payments →</Link>} />
          <DataTable filename="forecast-payables" pageSize={10} rows={inp.payables.map((p) => ({ ...p, planned: p.scheduled_date ?? p.due_date }))}
            columns={[{ key: 'number', label: 'Invoice', href: '/suppliers/invoices/{id}' }, { key: 'supplier', label: 'Supplier' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'priority', label: 'Priority' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'planned', label: 'Planned', kind: 'date' }, { key: 'amount_base', label: 'Amount', kind: 'money' }]} />
        </Card>
      </div>
    </div>
  );
}
