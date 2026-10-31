import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { materialityPct, budgetVersions, budgetLines, glAccountMonthly, lastActualMonth, fiscalYearMonths, fullYearForecast, plStatement, sumBase, sumBasePresent, variance, s, seq } from '@/lib/services/finance';
import { PageHeader, Callout, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { FinanceNav, Provenance, Stat, VarAmt } from '../financial-performance/_components/finance-ui';
import { createVersionAction } from './actions';
import { todayISO } from '@/lib/period';
import { fiscalYearOf, monthEnd, monthStart } from '@/lib/dates';
import { fmtMoney, fmtDate, monthLabel } from '@/lib/format';
import { sum } from '@/lib/money';
import { Lock } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BudgetHome({ searchParams }: { searchParams: SP }) {
  const { auth, sp, fyears } = await pageContext(searchParams, 'finance.view');
  const canManage = auth.permissions.has('finance.manage');
  const curFy = fiscalYearOf(todayISO(), auth.fyStartMonth);
  const data = await tx(auth, async (t) => {
    const versions = await budgetVersions(t);
    const last = (await lastActualMonth(t, todayISO())) ?? monthStart(todayISO());
    const fyMonths = fiscalYearMonths(curFy, auth.fyStartMonth);
    const approved = versions.find((v) => v.fiscal_year === curFy && v.kind === 'budget' && v.status === 'approved') ?? null;
    const forecast = versions.filter((v) => v.fiscal_year === curFy && v.kind === 'forecast' && v.status !== 'superseded')[0] ?? null;
    const [aLines, fLines, actual] = await seq(() => approved ? budgetLines(t, approved.id) : Promise.resolve([]), () => forecast ? budgetLines(t, forecast.id) : Promise.resolve([]), () => glAccountMonthly(t, fyMonths[0], monthEnd(fyMonths[11])));
    return { versions, last, fyMonths, approved, forecast, aLines, fLines, actual };
  });
  const { versions, last, fyMonths, approved, forecast, aLines, fLines, actual } = data;
  const ccy = auth.baseCurrency;
  const actualMonths = fyMonths.filter((m) => m <= last);

  // Current fiscal year outlook: revenue & EBITDA, YTD actual vs budget, full-year forecast
  const byMonth = <T extends { period: string; pl_line: string; amount: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { if (!m.has(r.period)) m.set(r.period, []); m.get(r.period)!.push(r); } return m; };
  const aM = byMonth(aLines), fM = byMonth(fLines), actM = byMonth(actual);
  const metric = (rows: { pl_line: string; amount: string }[] | undefined, k: 'revenue' | 'ebitda', present = false) => (rows ? (present ? plStatement(sumBasePresent(rows))[k] : plStatement(sumBase(rows))[k]) : null);
  const series = fyMonths.map((m) => ({ month: monthLabel(m), actual_rev: m <= last ? s(metric(actM.get(m), 'revenue')) : null, budget_rev: s(metric(aM.get(m), 'revenue', true)), forecast_rev: s(metric(fM.get(m), 'revenue', true)), actual_ebitda: m <= last ? s(metric(actM.get(m), 'ebitda')) : null, budget_ebitda: s(metric(aM.get(m), 'ebitda', true)), forecast_ebitda: s(metric(fM.get(m), 'ebitda', true)) }));
  const ytd = (k: 'actual_rev' | 'budget_rev' | 'actual_ebitda' | 'budget_ebitda') => sum(series.filter((_, i) => fyMonths[i] <= last).map((r) => r[k]));
  const toMap = (k: 'actual_rev' | 'budget_rev' | 'forecast_rev' | 'actual_ebitda' | 'budget_ebitda' | 'forecast_ebitda') => new Map(series.map((r, i) => [fyMonths[i], r[k] ?? '0']));
  const fyfRev = fullYearForecast(fyMonths, toMap('actual_rev'), forecast ? toMap('forecast_rev') : toMap('budget_rev'), last);
  const fyBudRev = sum(series.map((r) => r.budget_rev));
  const fyfEb = fullYearForecast(fyMonths, toMap('actual_ebitda'), forecast ? toMap('forecast_ebitda') : toMap('budget_ebitda'), last);
  const fyBudEb = sum(series.map((r) => r.budget_ebitda));
  const vRev = variance(ytd('actual_rev'), ytd('budget_rev'), true), vEb = variance(ytd('actual_ebitda'), ytd('budget_ebitda'), true);
  const ok = spGet(sp, 'ok'), err = spGet(sp, 'error');
  const fyOptions = Array.from(new Set([...fyears, curFy, curFy + 1])).sort();

  return (
    <div>
      <PageHeader eyebrow="Finance" title="Budget & forecast engine"
        subtitle={<>Versioned budgets and forecasts with segregation of duties (submitter ≠ approver, enforced by a database CHECK) and approval locking (trigger <code>trg_budget_line_guard</code>). Approving a version supersedes the previously approved version of the same fiscal year and kind.</>} />
      <FinanceNav current="/budget" />
      <div className="grid gap-3 lg:grid-cols-2">
        {ok && <Callout tone="pos" title={ok} />}
        {err && <Callout tone="neg" title="Action rejected">{err}</Callout>}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={`FY${curFy} revenue YTD (to ${monthLabel(last)})`} value={fmtMoney(ytd('actual_rev').toString(), ccy, { compact: true })} sub={<>budget {fmtMoney(ytd('budget_rev').toString(), ccy, { compact: true })} · <VarAmt v={s(vRev.pct, 6)} favourable={vRev.favourable} pct /></>} />
        <Stat label={`FY${curFy} EBITDA YTD`} value={fmtMoney(ytd('actual_ebitda').toString(), ccy, { compact: true })} sub={<>budget {fmtMoney(ytd('budget_ebitda').toString(), ccy, { compact: true })} · <VarAmt v={s(vEb.pct, 6)} favourable={vEb.favourable} pct /></>} />
        <Stat label="Full-year revenue forecast" value={fmtMoney(fyfRev.toString(), ccy, { compact: true })} sub={<>actual YTD + remaining {forecast ? `“${forecast.name}”` : 'budget'} months · budget {fmtMoney(fyBudRev.toString(), ccy, { compact: true })}</>} tone={fyfRev.lt(fyBudRev) ? 'neg' : 'pos'} />
        <Stat label="Full-year EBITDA forecast" value={fmtMoney(fyfEb.toString(), ccy, { compact: true })} sub={<>actual YTD + remaining {forecast ? 'forecast' : 'budget'} months · budget {fmtMoney(fyBudEb.toString(), ccy, { compact: true })}</>} tone={fyfEb.lt(fyBudEb) ? 'neg' : 'pos'} />
        <Stat label="Months actual / remaining" value={`${actualMonths.length} / ${12 - actualMonths.length}`} sub={`FY${curFy}: ${fyMonths[0].slice(0, 7)} → ${fyMonths[11].slice(0, 7)}`} />
        <Stat label="Versions" value={String(versions.length)} sub={`${versions.filter((v) => v.status === 'draft').length} draft · ${versions.filter((v) => v.status === 'submitted').length} submitted · ${versions.filter((v) => v.status === 'approved').length} approved`} />
      </div>

      <Card className="mt-4">
        <CardHeader title={`FY${curFy} revenue: actual vs approved budget${forecast ? ' vs forecast' : ''}`} subtitle={<>{approved ? <Link className="link" href={`/budget/${approved.id}`}>{approved.name}</Link> : 'No approved budget'}{forecast && <> · forecast <Link className="link" href={`/budget/${forecast.id}`}>{forecast.name}</Link> ({forecast.status})</>}</>} />
        <CardBody><TrendChart data={series} x="month" series={[{ key: 'actual_rev', label: 'Actual revenue', type: 'bar' }, { key: 'budget_rev', label: 'Approved budget', type: 'line', color: '#c43131' }, ...(forecast ? [{ key: 'forecast_rev', label: `Forecast (${forecast.status})`, type: 'line' as const, color: '#b8923d' }] : [])]} /></CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Versions" subtitle="Budget and forecast versions, newest fiscal year first. Approved and superseded versions are locked by the database." />
        {versions.length === 0 ? <CardBody><EmptyState title="No budget versions yet">Create the first draft below.</EmptyState></CardBody> : (
          <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
            <thead><tr><th className="th">Version</th><th className="th">Kind</th><th className="th">FY</th><th className="th">Status</th><th className="th">Rev.</th><th className="th">Parent</th><th className="th text-right">Lines</th><th className="th text-right">Revenue</th><th className="th text-right">Costs</th><th className="th">Prepared / submitted</th><th className="th">Approver</th><th className="th text-right">Comments</th></tr></thead>
            <tbody>{versions.map((v) => (
              <tr key={v.id} className="hover:bg-surface-2">
                <td className="td"><Link className="link font-medium" href={`/budget/${v.id}`}>{v.name}</Link></td>
                <td className="td capitalize">{v.kind}</td><td className="td">FY{v.fiscal_year}</td>
                <td className="td"><span className="inline-flex items-center gap-1"><StatusBadge status={v.status} />{(v.status === 'approved' || v.status === 'superseded') && <Lock className="h-3.5 w-3.5 text-muted" aria-label="locked" />}</span></td>
                <td className="td num">{v.revision}</td>
                <td className="td text-xs">{v.parent_version_id ? <Link className="link" href={`/budget/${v.parent_version_id}`}>{v.parent_name}</Link> : '—'}</td>
                <td className="td text-right num">{v.lines}{v.dim_lines !== '0' && <Badge className="ml-1" tone="info">{v.dim_lines} dim</Badge>}</td>
                <td className="td text-right num">{fmtMoney(v.total_revenue, ccy, { compact: true })}</td>
                <td className="td text-right num">{fmtMoney(v.total_cost, ccy, { compact: true })}</td>
                <td className="td text-xs">{v.created_by_name ?? '—'}{v.submitted_by_name ? ` / ${v.submitted_by_name}` : ''}</td>
                <td className="td text-xs">{v.approved_by_name ? `${v.approved_by_name} · ${fmtDate(v.approved_at)}` : '—'}</td>
                <td className="td text-right num">{v.comments}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      {canManage ? (
        <Card className="mt-6" id="create">
          <CardHeader title="Create a draft version" subtitle="Copy every line from an existing version (any status) or start empty. To revise an approved version keeping its lineage (parent + revision number), open it and use “Create revision”." />
          <CardBody>
            <form action={createVersionAction} className="grid gap-3 md:grid-cols-6 md:items-end">
              <label className="md:col-span-2"><span className="label">Name</span><input name="name" className="input" required minLength={3} maxLength={120} placeholder={`FY${curFy} Forecast Q3`} /></label>
              <label><span className="label">Kind</span><select name="kind" className="input" defaultValue="forecast"><option value="budget">Budget</option><option value="forecast">Forecast</option></select></label>
              <label><span className="label">Fiscal year</span><select name="fiscalYear" className="input" defaultValue={curFy}>{fyOptions.map((y) => <option key={y} value={y}>FY{y}</option>)}</select></label>
              <label className="md:col-span-2"><span className="label">Copy lines from</span><select name="copyFrom" className="input" defaultValue={approved?.id ?? ''}><option value="">— empty version —</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.status}, {v.lines} lines)</option>)}</select></label>
              <label className="md:col-span-5"><span className="label">Notes</span><input name="notes" className="input" maxLength={2000} placeholder="Purpose / assumptions" /></label>
              <button className="btn-primary" type="submit">Create draft</button>
            </form>
          </CardBody>
        </Card>
      ) : <p className="mt-4 text-xs text-muted">Creating and editing versions requires the finance.manage permission; approval requires finance.approve.</p>}

      <Provenance>Budget lines: <code>budget_lines.amount_base</code> (positive = income for revenue accounts, cost for expense accounts). Actuals: gl_entries by pl_line. Full-year forecast = actual for booked months (≤ {last.slice(0, 7)}) + plan for remaining months. Variances: favourable in green.{fyBudRev.isZero() ? ' No approved budget for the current fiscal year.' : ''} Material threshold for commentary: {materialityPct(auth.settings).toString()}% (tenant setting <code>materiality_pct</code>).</Provenance>
    </div>
  );
}
