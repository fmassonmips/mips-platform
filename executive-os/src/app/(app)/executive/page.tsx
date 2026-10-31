import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { kpiDashboard, monthlySeries, type KpiRow } from '@/lib/services/kpi';
import { marginAlerts } from '@/lib/services/merchants';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { KpiCard, type KpiCardData } from '@/components/ui/kpi-card';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { TrendChart, HBarChart } from '@/components/ui/charts';
import { trailingMonths } from '@/lib/period';
import { monthStart } from '@/lib/dates';
import { fmtMoney, fmtPct, monthLabel } from '@/lib/format';
import { dec } from '@/lib/money';

export const dynamic = 'force-dynamic';

const FIN = ['FIN.REVENUE', 'FIN.REVENUE_GROWTH', 'FIN.GROSS_PROFIT', 'FIN.GROSS_MARGIN', 'FIN.EBITDA', 'FIN.OPERATING_PROFIT', 'FIN.PBT', 'FIN.NET_PROFIT', 'FIN.CASH_BALANCE', 'FIN.FREE_CASH_FLOW', 'FIN.AR', 'FIN.DSO', 'FIN.BUDGET_VARIANCE_EBITDA', 'FIN.BUDGET_VARIANCE_REVENUE'];
const PAY = ['PAY.GPV', 'PAY.TXN_COUNT', 'PAY.SUCCESS_COUNT', 'PAY.SUCCESS_RATE', 'PAY.ATV', 'PAY.REVENUE_PER_TXN', 'PAY.COST_PER_TXN', 'PAY.EFFECTIVE_MDR', 'PAY.TAKE_RATE', 'PAY.NET_REVENUE', 'PAY.CONTRIBUTION', 'PAY.FAILURE_RATE'];
const OPS = ['OPS.ACTIVE_MERCHANTS', 'OPS.NEW_MERCHANTS', 'OPS.MERCHANT_CHURN', 'OPS.ONBOARDING_DAYS', 'OPS.PENDING_ONBOARDING', 'OPS.SUPPORT_INCIDENTS', 'OPS.UPTIME'];
const SPARK = ['FIN.REVENUE', 'FIN.EBITDA', 'FIN.NET_PROFIT', 'FIN.CASH_BALANCE', 'PAY.GPV', 'PAY.TAKE_RATE', 'PAY.CONTRIBUTION', 'PAY.SUCCESS_RATE', 'OPS.ACTIVE_MERCHANTS', 'FIN.DSO', 'FIN.GROSS_MARGIN', 'OPS.ONBOARDING_DAYS'];

export default async function ExecutiveOverview({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'dashboard.view');
  const compare = spGet(sp, 'compare') === 'yoy' ? 'yoy' : 'prior';
  const data = await tx(auth, async (t) => {
    const dash = await kpiDashboard(t, { tenantId: auth.tenantId, userId: auth.userId, start: period.start, end: period.end, reason: 'executive overview' }, compare);
    const trail = trailingMonths(period.end, 12);
    const series = await monthlySeries(t, auth.tenantId, auth.userId, trail, [...new Set([...SPARK, 'PAY.NET_REVENUE'])]);
    const alerts = await marginAlerts(t, monthStart(period.end), auth.settings.margin_alert_threshold_pct ? dec(auth.settings.margin_alert_threshold_pct).div(100).toString() : '0.10');
    return { dash, series, trail, alerts };
  });
  const { dash, series, trail, alerts } = data;
  const prev = new Map(dash.comparison.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const card = (r: KpiRow): KpiCardData => ({ code: r.code, name: r.name, unit: r.unit, direction: r.direction, value: r.value, previous: prev.get(r.code)?.value ?? null, confidence: r.confidence, statusNote: r.status_note, currency: r.currency, series: series[r.code]?.map((x) => x.value), resultId: r.id, source: r.data_source });
  const byCode = new Map(dash.current.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const pick = (codes: string[]) => codes.map((c) => byCode.get(c)).filter(Boolean).map((r) => card(r!));
  const compareLabel = compare === 'yoy' ? 'vs last year' : 'vs prior period';
  const failing = (dash.run.checks as any[]).filter((c) => c.status === 'fail');
  const acquirerRows = dash.current.filter((r) => r.code === 'PAY.NET_REVENUE_BY_ACQUIRER').map((r) => ({ label: r.dimension.split(':')[1], v: r.value }));
  const methodRows = dash.current.filter((r) => r.code === 'PAY.NET_REVENUE_BY_METHOD').map((r) => ({ label: r.dimension.split(':')[1], v: r.value }));
  const trend = trail.map((m, i) => ({ month: monthLabel(m), revenue: series['FIN.REVENUE'][i].value, ebitda: series['FIN.EBITDA'][i].value, gpv: series['PAY.GPV'][i].value, net: series['PAY.NET_REVENUE'][i].value, take: series['PAY.TAKE_RATE'][i].value }));
  const cash = byCode.get('FIN.CASH_BALANCE');

  return (
    <div>
      <PageHeader eyebrow="Executive Overview" title={`Business performance — ${period.label}`}
        subtitle={<>All figures computed server-side by calculation run <Link className="link" href={`/formula-audit?run=${dash.run.id}`}>{dash.run.id.slice(0, 8)}</Link> ({dash.run.engine_version}) on the <b>accounting-date</b> basis. Event, processing and settlement dates are retained on every transaction (see drill-down).</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} />} />

      <div className="grid gap-3 lg:grid-cols-3">
        {alerts.filter((a) => a.kind === 'margin_decline').slice(0, 2).map((a) => (
          <Callout key={a.merchantId} tone="neg" title={`Contribution margin decline — ${a.name}`}>
            {monthLabel(a.month)} unit margin {a.unitMarginBps} bps vs {a.baselineUnitMarginBps} bps (6-month average, {fmtPct(a.changePct)}); impact ≈ {fmtMoney(a.change)} this month. Primary driver: <b>{a.primaryDriver}</b> (wholesale {dec(a.drivers.wholesaleBps).gte(0) ? '+' : ''}{a.drivers.wholesaleBps} bps, MDR {a.drivers.mdrBps} bps). <Link className="link" href={`/merchants/${a.merchantId}?range=${encodeURIComponent(period.key)}`}>Investigate →</Link>
          </Callout>
        ))}
        {alerts.some((a) => a.kind === 'loss_making') && (
          <Callout tone="warn" title={`${alerts.filter((a) => a.kind === 'loss_making').length} loss-making merchant(s) at contribution level`}>
            {alerts.filter((a) => a.kind === 'loss_making').slice(0, 3).map((a) => <div key={a.merchantId}><Link className="link" href={`/merchants/${a.merchantId}?range=${encodeURIComponent(period.key)}`}>{a.name}</Link>: {fmtMoney(a.contribution)} ({a.unitMarginBps} bps)</div>)}
          </Callout>
        )}
        {failing.length > 0 && (
          <Callout tone="warn" title={`${failing.length} failing data control${failing.length > 1 ? 's' : ''} — affected KPIs marked DISPUTED`}>
            {failing.map((c) => <div key={c.code}><b>{c.code}</b> {c.name}: {c.samples?.[0] ?? c.detail}</div>)}
            <Link className="link" href={`/formula-audit?run=${dash.run.id}`}>Open formula audit →</Link>
          </Callout>
        )}
        {alerts.length === 0 && failing.length === 0 && <Callout tone="pos" title="No margin alerts or failing controls for this period" />}
        {cash && <Callout tone="info" title="Liquidity">Unrestricted cash {fmtMoney(cash.value, 'MUR', { compact: true })}. Restricted, safeguarded and merchant funds ({fmtMoney(cash.inputs.restricted_excluded, 'MUR', { compact: true })}) are excluded. <Link className="link" href="/liquidity">Runway & stress tests →</Link></Callout>}
      </div>

      <Section title="Financial (general ledger)"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{pick(FIN).map((k) => <KpiCard key={k.code} k={k} range={period.key} compareLabel={compareLabel} />)}</div></Section>
      <Section title="Payments (transaction engine)"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">{pick(PAY).map((k) => <KpiCard key={k.code} k={k} range={period.key} compareLabel={compareLabel} />)}</div></Section>
      <Section title="Operations"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{pick(OPS).map((k) => <KpiCard key={k.code} k={k} range={period.key} compareLabel={compareLabel} />)}</div></Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Revenue and EBITDA — trailing 12 months" subtitle="General ledger, monthly calculation runs" /><CardBody><TrendChart data={trend} x="month" series={[{ key: 'revenue', label: 'Revenue', type: 'bar' }, { key: 'ebitda', label: 'EBITDA', type: 'line', color: '#b8923d' }]} /></CardBody></Card>
        <Card><CardHeader title="Processed value is not revenue" subtitle="GPV (funds processed for merchants, right axis) vs net payment revenue (left axis)" /><CardBody><TrendChart data={trend} x="month" series={[{ key: 'net', label: 'Net payment revenue', type: 'bar' }, { key: 'gpv', label: 'GPV (right axis)', type: 'line', yAxis: 'right', color: '#64748b' }]} /></CardBody></Card>
        <Card><CardHeader title="Net revenue by acquirer" subtitle={`MDR − wholesale, ${period.label}`} actions={<Link className="link text-xs" href={`/merchants?groupBy=acquirer&range=${encodeURIComponent(period.key)}`}>Drill down</Link>} /><CardBody><HBarChart data={acquirerRows} labelKey="label" valueKey="v" /></CardBody></Card>
        <Card><CardHeader title="Net revenue by payment method" subtitle={`MDR − wholesale, ${period.label}`} actions={<Link className="link text-xs" href={`/merchants?groupBy=method&range=${encodeURIComponent(period.key)}`}>Drill down</Link>} /><CardBody><HBarChart data={methodRows} labelKey="label" valueKey="v" color="#b8923d" /></CardBody></Card>
      </div>
      <p className="mt-4 text-2xs text-muted">Confidence: VERIFIED = reconciled management figure (not an external audit opinion) · PENDING = open period · DISPUTED = failing control · ESTIMATED = relies on documented assumptions. Comparison period: {dash.comparisonRange.start} → {dash.comparisonRange.end}.</p>
    </div>
  );
}
