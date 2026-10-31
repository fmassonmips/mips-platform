import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { kpiDashboard, ensureRun, resultsForRun, type KpiRow } from '@/lib/services/kpi';
import { glAccountMonthly, approvedBudgetMonthly, sumBase, sumBasePresent, plStatement, plMargins, variance, isMaterial, lastActualMonth, materialityPct, comparisonRange, PL_LAYOUT, higherIsBetter, s, type PlFull, seq } from '@/lib/services/finance';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { KpiCard, type KpiCardData } from '@/components/ui/kpi-card';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { FinanceNav, Amt, VarAmt, PpDelta, Provenance } from './_components/finance-ui';
import { trailingMonths } from '@/lib/period';
import { monthEnd, monthStart, monthsInRange } from '@/lib/dates';
import { fmtPct, monthLabel } from '@/lib/format';
import { dec, type Dec } from '@/lib/money';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
const CODES = ['FIN.REVENUE', 'FIN.REVENUE_GROWTH', 'FIN.GROSS_PROFIT', 'FIN.GROSS_MARGIN', 'FIN.EBITDA', 'FIN.OPERATING_PROFIT', 'FIN.PBT', 'FIN.NET_PROFIT', 'FIN.BUDGET_VARIANCE_REVENUE', 'FIN.BUDGET_VARIANCE_EBITDA'];

export default async function FinancialPerformance({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'finance.view');
  const compare = spGet(sp, 'compare') === 'yoy' ? 'yoy' : 'prior';
  const mat = materialityPct(auth.settings);
  const data = await tx(auth, async (t) => {
    const last = (await lastActualMonth(t, period.end)) ?? monthStart(period.end);
    const end = monthEnd(last) < period.end && monthEnd(last) >= period.start ? monthEnd(last) : period.end;
    // KPI run on booked months only, so a partial fiscal year is not compared with a full one
    const dash = await kpiDashboard(t, { tenantId: auth.tenantId, userId: auth.userId, start: period.start, end, reason: 'financial performance' }, compare);
    const cmp = comparisonRange(period.start, end, compare);
    // Month-aligned comparison run (GL is posted on month-end dates, so a day-count prior window can catch an extra month)
    const cmpRun = await ensureRun(t, { tenantId: auth.tenantId, userId: auth.userId, start: cmp.start, end: cmp.end, reason: `comparison for ${period.start}..${end}` });
    const cmpResults = await resultsForRun(t, cmpRun.runId);
    const [cur, prev, bud] = await seq(() => glAccountMonthly(t, period.start, end), () => glAccountMonthly(t, cmp.start, cmp.end), () => approvedBudgetMonthly(t, period.start, end, auth.fyStartMonth));
    const trail = trailingMonths(last, 18);
    const [trend, trendBud] = await seq(() => glAccountMonthly(t, trail[0], monthEnd(last)), () => approvedBudgetMonthly(t, trail[0], monthEnd(last), auth.fyStartMonth));
    return { dash, cur, prev, bud, cmp, end, trail, trend, trendBud, last, cmpResults };
  });
  const { dash, cur, prev, bud, cmp, end, trail, trend, trendBud, cmpResults } = data;
  const actual = plStatement(sumBase(cur)), comparison = plStatement(sumBase(prev)), budget = plStatement(sumBasePresent(bud.rows));
  const hasPrev = prev.length > 0;
  const mA = plMargins(actual), mC = plMargins(comparison), mB = plMargins(budget);
  const budMonths = new Set(bud.rows.map((r) => r.period));
  const rangeMonths = monthsInRange(period.start, end);
  const budCoverage = rangeMonths.filter((m) => budMonths.has(m)).length;

  // KPI cards
  const prevK = new Map(cmpResults.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const byCode = new Map(dash.current.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const card = (r: KpiRow): KpiCardData => ({ code: r.code, name: r.name, unit: r.unit, direction: r.direction, value: r.value, previous: prevK.get(r.code)?.value ?? null, confidence: r.confidence, statusNote: r.status_note, currency: r.currency, resultId: r.id, source: r.data_source });
  const cards = CODES.map((c) => byCode.get(c)).filter(Boolean).map((r) => card(r!));
  const failing = (dash.run.checks as any[]).filter((c) => c.status === 'fail' && (c.affects as string[]).includes('gl'));
  const compareLabel = compare === 'yoy' ? 'vs last year' : 'vs prior period';

  // trend
  const byMonth = new Map<string, typeof trend>();
  for (const r of trend) { if (!byMonth.has(r.period)) byMonth.set(r.period, []); byMonth.get(r.period)!.push(r); }
  const budByMonth = new Map<string, typeof trendBud.rows>();
  for (const r of trendBud.rows) { if (!budByMonth.has(r.period)) budByMonth.set(r.period, []); budByMonth.get(r.period)!.push(r); }
  const series = trail.map((m) => {
    const p = plStatement(sumBase(byMonth.get(m) ?? [])); const mg = plMargins(p);
    const b = budByMonth.has(m) ? plStatement(sumBasePresent(budByMonth.get(m)!)) : null;
    return { month: monthLabel(m), period: m, revenue: s(p.revenue), gross_profit: s(p.gross_profit), ebitda: s(p.ebitda), net_profit: s(p.net_profit), gm: s(mg.gross, 6), em: s(mg.ebitda, 6), nm: s(mg.net, 6), budget_revenue: s(b?.revenue ?? null), budget_ebitda: s(b?.ebitda ?? null) };
  });

  const rowsFor = (k: keyof PlFull) => {
    const hb = higherIsBetter(k as any);
    const vc = variance(actual[k], hasPrev ? comparison[k] : null, hb);
    const vb = variance(actual[k], budget[k], hb);
    return { vc, vb, material: isMaterial(actual[k], budget[k], mat) };
  };
  const kpiOf = new Map(PL_LAYOUT.map((l) => [l.key, l.kpi]));

  return (
    <div>
      <PageHeader eyebrow="Finance" title={`Financial performance — ${period.label}`}
        subtitle={<>General-ledger P&L against the {compare === 'yoy' ? 'same period last year' : 'prior period'} ({cmp.start} → {cmp.end}) and the approved budget. KPI cards come from calculation run <Link className="link" href={`/formula-audit?run=${dash.run.id}`}>{String(dash.run.id).slice(0, 8)}</Link>.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} />} />
      <FinanceNav current="/financial-performance" range={period.key} />

      <div className="grid gap-3 lg:grid-cols-2">
        {failing.map((c) => (
          <Callout key={c.code} tone="neg" title={`DISPUTED — ${c.code} ${c.name}`}>
            {c.detail}. {(c.samples as string[]).map((x) => <div key={x} className="num">{x}</div>)}
            GL-based KPIs for the affected period are marked DISPUTED until a correcting journal is posted. <Link className="link" href={`/pnl/entries?account=4000&range=${encodeURIComponent(period.key)}`}>Inspect revenue journals →</Link>
          </Callout>
        ))}
        {end < period.end && <Callout tone="info" title={`Actuals available to ${end}`}>Comparisons use booked months only ({rangeMonths.length} month(s)); later months of the selected range have no GL postings yet.</Callout>}
        {budCoverage < rangeMonths.length && <Callout tone="warn" title={`Approved budget covers ${budCoverage} of ${rangeMonths.length} month(s)`}>Budget variances relate to the budgeted months only.</Callout>}
      </div>

      <Section title="Registered financial KPIs"><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{cards.map((k) => <KpiCard key={k.code} k={k} range={period.key} compareLabel={compareLabel} />)}</div></Section>

      <Card className="mt-6">
        <CardHeader title={`P&L summary (${auth.baseCurrency})`} subtitle={<>Actual {period.start} → {end} · comparison {cmp.start} → {cmp.end} · budget: {bud.versions.map((v, i) => <span key={v.id}>{i ? ', ' : ''}<Link className="link" href={`/budget/${v.id}`}>{v.name}</Link></span>)}{bud.versions.length ? '' : 'none'} · material ≥ {mat.toString()}%</>}
          actions={<Link className="link text-xs" href={`/pnl?range=${encodeURIComponent(period.key)}`}>Full statement →</Link>} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr><th className="th">Line</th><th className="th text-right">Actual</th><th className="th text-right">{compare === 'yoy' ? 'Last year' : 'Prior period'}</th><th className="th text-right">Δ</th><th className="th text-right">Δ %</th><th className="th text-right">Budget</th><th className="th text-right">Var</th><th className="th text-right">Var %</th><th className="th">Proof</th></tr></thead>
            <tbody>
              {PL_LAYOUT.map((l) => {
                const r = rowsFor(l.key);
                return (
                  <tr key={l.key} className={cn('hover:bg-surface-2', l.kind === 'subtotal' && 'bg-surface-2/60 font-semibold')}>
                    <td className="td">{l.kind === 'base' ? <Link className="link" href={`/pnl/entries?line=${l.key}&range=${encodeURIComponent(period.key)}`}>{l.label}</Link> : l.label}</td>
                    <td className="td text-right"><Amt v={s(actual[l.key])} /></td>
                    <td className="td text-right"><Amt v={hasPrev ? s(comparison[l.key]) : null} /></td>
                    <td className="td text-right"><VarAmt v={s(r.vc.abs)} favourable={r.vc.favourable} /></td>
                    <td className="td text-right"><VarAmt v={s(r.vc.pct, 6)} favourable={r.vc.favourable} pct /></td>
                    <td className="td text-right"><Amt v={s(budget[l.key])} /></td>
                    <td className="td text-right"><VarAmt v={s(r.vb.abs)} favourable={r.vb.favourable} /></td>
                    <td className="td text-right"><VarAmt v={s(r.vb.pct, 6)} favourable={r.vb.favourable} pct />{r.material && <Badge tone="warn" className="ml-1">M</Badge>}</td>
                    <td className="td text-xs">{kpiOf.get(l.key) && <Link className="link" href={`/proof/kpi/${kpiOf.get(l.key)}?range=${encodeURIComponent(period.key)}`}>{kpiOf.get(l.key)}</Link>}</td>
                  </tr>
                );
              })}
              {([['Gross margin', 'gross'], ['EBITDA margin', 'ebitda'], ['Operating margin', 'operating'], ['Net margin', 'net']] as const).map(([label, k]) => {
                const d = (a: Dec | null, b: Dec | null) => (a && b ? a.minus(b) : null);
                const dc = d(mA[k], hasPrev ? mC[k] : null), db = d(mA[k], mB[k]);
                return (
                  <tr key={k} className="text-muted"><td className="td italic">{label}</td><td className="td text-right num">{fmtPct(s(mA[k], 6))}</td><td className="td text-right num">{fmtPct(hasPrev ? s(mC[k], 6) : null)}</td><td className="td text-right"><PpDelta v={s(dc, 6)} favourable={dc ? (dc.isZero() ? null : dc.gt(0)) : null} /></td><td className="td" /><td className="td text-right num">{fmtPct(s(mB[k], 6))}</td><td className="td text-right"><PpDelta v={s(db, 6)} favourable={db ? (db.isZero() ? null : db.gt(0)) : null} /></td><td className="td" /><td className="td" /></tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CardBody className="pt-2"><Provenance>Actual: Σ gl_entries by chart-of-accounts pl_line (income = credit − debit, expense = debit − credit). Budget: approved <i>budget</i> version for each month’s fiscal year; subtotals below EBITDA show “—” when D&A / finance / tax are not budgeted. Green = favourable.</Provenance></CardBody>
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Revenue, gross profit, EBITDA, net profit — 18 months" subtitle={`${monthLabel(trail[0])} → ${monthLabel(trail[trail.length - 1])}, general ledger`} />
          <CardBody><TrendChart data={series} x="month" height={260} series={[{ key: 'revenue', label: 'Revenue', type: 'bar' }, { key: 'gross_profit', label: 'Gross profit', type: 'line', color: '#2563c2' }, { key: 'ebitda', label: 'EBITDA', type: 'line', color: '#b8923d' }, { key: 'net_profit', label: 'Net profit', type: 'line', color: '#168052' }]} /></CardBody></Card>
        <Card><CardHeader title="Margins — 18 months" subtitle="Gross, EBITDA and net margin on GL revenue" />
          <CardBody><TrendChart data={series} x="month" unit="%" height={260} series={[{ key: 'gm', label: 'Gross margin' }, { key: 'em', label: 'EBITDA margin', color: '#b8923d' }, { key: 'nm', label: 'Net margin', color: '#168052' }]} /></CardBody></Card>
        <Card><CardHeader title="Revenue: actual vs approved budget" subtitle="Bars = actual GL revenue; line = approved budget (months without a budget are blank)" actions={<Link className="link text-xs" href="/budget">Budget engine →</Link>} />
          <CardBody><TrendChart data={series} x="month" series={[{ key: 'revenue', label: 'Actual revenue', type: 'bar' }, { key: 'budget_revenue', label: 'Budget revenue', type: 'line', color: '#c43131' }]} /></CardBody></Card>
        <Card><CardHeader title="EBITDA: actual vs approved budget" subtitle="SBM wholesale increase from Sep 2026 is not in the FY2027 budget" />
          <CardBody><TrendChart data={series} x="month" series={[{ key: 'ebitda', label: 'Actual EBITDA', type: 'bar', color: '#b8923d' }, { key: 'budget_ebitda', label: 'Budget EBITDA', type: 'line', color: '#c43131' }]} /></CardBody></Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Monthly figures" subtitle="Same data as the charts — sortable and exportable" />
        <DataTable filename="financial-performance-monthly" rows={series} pageSize={18} dense searchable columns={[
          { key: 'month', label: 'Month' }, { key: 'revenue', label: 'Revenue', kind: 'money' }, { key: 'budget_revenue', label: 'Budget revenue', kind: 'money' }, { key: 'gross_profit', label: 'Gross profit', kind: 'money' },
          { key: 'ebitda', label: 'EBITDA', kind: 'money' }, { key: 'budget_ebitda', label: 'Budget EBITDA', kind: 'money' }, { key: 'net_profit', label: 'Net profit', kind: 'money' },
          { key: 'gm', label: 'Gross margin', kind: 'pct' }, { key: 'em', label: 'EBITDA margin', kind: 'pct' }, { key: 'nm', label: 'Net margin', kind: 'pct' },
        ]} />
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ href: '/pnl', t: 'Profit & Loss', d: 'Monthly / quarterly / annual statement with drill-down to journal lines and XLSX export' },
          { href: '/revenue', t: 'Revenue Intelligence', d: 'Growth, mix, concentration and the revenue bridge (volume vs price)' },
          { href: '/costs', t: 'Operating Costs', d: 'Categories, fixed vs variable, unit cost, leverage and anomalies' },
          { href: '/budget', t: 'Budget & Forecast', d: 'Versions, approvals, variance commentary and full-year forecast' }].map((x) => (
          <Link key={x.href} href={`${x.href}?range=${encodeURIComponent(period.key)}`} className="card block p-4 hover:bg-surface-2"><div className="text-sm font-semibold">{x.t} →</div><div className="mt-1 text-xs text-muted">{x.d}</div></Link>
        ))}
      </div>
      <Provenance>Comparison basis: {compare === 'yoy' ? 'same period last year' : 'immediately preceding period of equal length'}. {dec(dash.current.length).isZero() ? '' : `${dash.current.length} KPI results in the run.`} Confidence badges: VERIFIED = reconciled management figure (not an audit opinion); DISPUTED = failing control.</Provenance>
    </div>
  );
}
