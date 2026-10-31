import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { economicsBy, marginAlerts, merchantList, portfolioMonthly, controlTotals, GROUP_BY, type GroupBy, type EconRow } from '@/lib/services/merchants';
import { segmentMerchants, pricingOpportunities, trendMetrics, SEGMENTS, type SegmentInput, type SegmentCode } from '@/lib/services/segmentation';
import { tenantInfo } from '@/lib/services/facts';
import { PageHeader, Section, Callout, EmptyState } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable, type Col } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { ProfitabilityMatrix, SEGMENT_COLORS, type MatrixPoint } from './matrix';
import { ALLOC_LABEL, ALLOC_METHODS, parseAlloc, policyLabel, Stat, SegmentBadge, KeepParams } from './shared';
import { addMonths, monthStart, monthsInRange } from '@/lib/dates';
import { todayISO } from '@/lib/period';
import { fmtMoney, fmtPct, fmtBps, fmtNumber, monthLabel } from '@/lib/format';
import { dec, ZERO } from '@/lib/money';
import type { AllocationMethod } from '@/lib/engine/economics';

export const dynamic = 'force-dynamic';

export default async function MerchantIntelligence({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'merchant.view');
  const gbRaw = spGet(sp, 'groupBy');
  const groupBy: GroupBy = gbRaw && gbRaw in GROUP_BY ? (gbRaw as GroupBy) : 'merchant';
  const tenantDefault = (auth.settings.overhead_allocation as AllocationMethod) || 'by_revenue';
  const alloc = parseAlloc(spGet(sp, 'alloc'), tenantDefault);
  const mx = spGet(sp, 'mx') === 'net' ? 'net' : 'gpv';
  const endMonth = monthStart(period.end);
  const today = todayISO();
  const nMonths = monthsInRange(period.start, period.end).length;
  const threshold = auth.settings.margin_alert_threshold_pct ? dec(auth.settings.margin_alert_threshold_pct).div(100).toString() : '0.10';

  const d = await tx(auth, async (t) => {
    const econ = await economicsBy(t, period.start, period.end, groupBy, { allocation: alloc });
    const byMerchant = groupBy === 'merchant' ? econ : await economicsBy(t, period.start, period.end, 'merchant', { allocation: alloc });
    const [list, monthly, alerts, control, ti] = await Promise.all([merchantList(t), portfolioMonthly(t, addMonths(endMonth, -5), endMonth), marginAlerts(t, endMonth, threshold), controlTotals(t, period.start, period.end), tenantInfo(t)]);
    return { econ, byMerchant, list, monthly, alerts, control, ti };
  });
  const { econ, byMerchant, list, monthly, alerts, control, ti } = d;
  const g = GROUP_BY[groupBy];
  const policy = policyLabel(econ.policy, ti.settings?.revenue_policy_note);

  // ---- segmentation ----
  const meta = new Map(list.map((m: any) => [m.id, m]));
  const segInputs: SegmentInput[] = byMerchant.rows.filter((r) => meta.has(r.key)).map((r) => {
    const m: any = meta.get(r.key);
    return { id: r.key, code: m.code, name: m.name, status: m.status, gpv: r.gpv, successes: r.successes, mdr: r.mdr, wholesale: r.wholesale, processing: r.processing, netRevenue: r.netRevenue, contribution: r.contribution, commercialImportance: m.commercial_importance, churnRisk: m.churn_risk, growthPotential: m.growth_potential, priceLockedUntil: m.price_locked_until, contractNotes: m.contract_notes, trend: trendMetrics(monthly.get(r.key) ?? []) };
  });
  const seg = segmentMerchants(segInputs, { today });
  const opps = pricingOpportunities(seg, segInputs, nMonths);
  const segById = new Map(seg.rows.map((r) => [r.id, r]));
  const points: MatrixPoint[] = seg.rows.filter((r) => dec(r.gpv).gt(0) && r.unitMarginBps !== null).map((r) => ({
    id: r.id, name: r.name, segment: r.segment, x: mx === 'gpv' ? r.gpv : r.netRevenue, y: r.unitMarginBps!, size: r.netRevenue,
    xLabel: `GPV ${fmtMoney(r.gpv, 'MUR', { compact: true })} · net revenue ${fmtMoney(r.netRevenue, 'MUR', { compact: true })}`, yLabel: `Contribution ${fmtBps(r.unitMarginBps)} of GPV`, flags: r.flags.join(' · '),
  }));
  const xRef = mx === 'gpv' ? seg.thresholds.medianGpv : null;

  // ---- table ----
  const rows = econ.rows.map((r) => ({ ...r, segment: segById.get(r.key)?.segmentLabel ?? '' }));
  const T = econ.totals;
  const sumRows = (k: keyof EconRow) => econ.rows.reduce((a, r) => a.plus(dec((r[k] as string) ?? 0)), ZERO);
  const checks = [
    { label: 'GPV (successful)', rows: sumRows('gpv'), total: dec(T.gpv), source: dec(control.gpv) },
    { label: 'Successful transactions', rows: sumRows('successes'), total: dec(T.successes), source: dec(control.successes), count: true },
    { label: 'Gross acquiring fees (MDR)', rows: sumRows('mdr'), total: dec(T.mdr), source: dec(control.mdr) },
    { label: 'Wholesale cost', rows: sumRows('wholesale'), total: dec(T.wholesale), source: dec(control.wholesale) },
    { label: 'Direct processing', rows: sumRows('processing'), total: dec(T.processing), source: dec(control.processing) },
    { label: 'SaaS fees', rows: sumRows('saas'), total: dec(T.saas), source: g.saas ? dec(control.saas) : ZERO, note: g.saas ? undefined : 'not attributable to this dimension' },
    { label: 'Allocated overhead', rows: sumRows('overhead'), total: dec(T.overhead), source: alloc === 'none' ? ZERO : dec(econ.overheadPool), note: 'source = overhead pool' },
  ];
  const allOk = checks.every((c) => c.rows.eq(c.total) && c.rows.eq(c.source));
  const money = (k: string, label: string, dp = 0): Col => ({ key: k, label, kind: 'money', dp });
  const cols: Col[] = [
    { key: 'name', label: g.label, href: groupBy === 'merchant' ? `/merchants/{key}?range=${encodeURIComponent(period.key)}` : undefined },
    ...(groupBy === 'merchant' ? [{ key: 'segment', label: 'Segment' } as Col] : []),
    money('gpv', 'GPV'), { key: 'successes', label: 'Successful txns', kind: 'number' }, money('avgTicket', 'Avg ticket', 2),
    money('mdr', 'Gross acquiring fees (MDR)'), money('wholesale', 'Wholesale'), ...(g.saas ? [money('saas', 'SaaS')] : []),
    money('recognisedRevenue', econ.policy === 'principal_gross' ? 'Recognised revenue (gross)' : 'Net revenue (recognised, agent net)'), money('processing', 'Direct processing'),
    money('contribution', 'Contribution'), { key: 'contributionPct', label: 'Contribution %', kind: 'pct' }, money('overhead', `Overhead (${ALLOC_LABEL[econ.allocation].toLowerCase()})`),
    money('netProfit', 'Net profitability'), { key: 'effectiveMdrBps', label: 'Eff. MDR bps', kind: 'bps' }, { key: 'takeRateBps', label: 'MIPS take rate bps', kind: 'bps' },
    money('revenuePerTxn', 'Revenue / txn', 2), money('costPerTxn', 'Cost / txn', 2),
  ];
  const marginDecl = alerts.filter((a) => a.kind === 'margin_decline');
  const loss = alerts.filter((a) => a.kind === 'loss_making');
  const range = encodeURIComponent(period.key);

  // ---- quadrants ----
  const quad = (hm: boolean, hv: boolean) => seg.rows.filter((r) => dec(r.gpv).gt(0) && r.marginHigh === hm && r.volumeHigh === hv);
  const Q = ({ title, sub, items }: { title: string; sub: string; items: typeof seg.rows }) => (
    <div className="rounded-md border border-border p-2.5">
      <div className="text-xs font-semibold">{title} <span className="font-normal text-muted">· {items.length}</span></div>
      <div className="mb-1.5 text-2xs text-muted">{sub}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((r) => (
          <Link key={r.id} href={`/merchants/${r.id}?range=${range}`} title={`${r.segmentLabel} — ${r.reasons.join('; ')}`} className="rounded border px-1.5 py-0.5 text-2xs hover:bg-surface-2" style={{ borderColor: SEGMENT_COLORS[r.segment] }}>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: SEGMENT_COLORS[r.segment] }} />{r.name.replace(' (DEMO)', '')}
          </Link>
        ))}
        {items.length === 0 && <span className="text-2xs text-muted">none</span>}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="Payment economics" title={`Merchant Profitability Intelligence — ${period.label}`}
        subtitle={<>Fee-engine economics aggregated from <b>transactions</b> (accounting-date basis) and SaaS fees from active <b>pricing agreements</b>; overhead from GL opex + D&amp;A. Revenue policy: <b>{policy}</b>. GPV is money processed for merchants — it is never MIPS revenue.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3 no-print">
        <KeepParams sp={sp} except={['groupBy', 'alloc', 'mx']} />
        <div><label className="label" htmlFor="groupBy">Analyse by</label>
          <select id="groupBy" name="groupBy" defaultValue={groupBy} className="input w-auto py-1 text-xs">{(Object.keys(GROUP_BY) as GroupBy[]).map((k) => <option key={k} value={k}>{GROUP_BY[k].label}</option>)}</select></div>
        <div><label className="label" htmlFor="alloc">Overhead allocation</label>
          <select id="alloc" name="alloc" defaultValue={alloc} className="input w-auto py-1 text-xs">{ALLOC_METHODS.map((k) => <option key={k} value={k}>{ALLOC_LABEL[k]}{k === tenantDefault ? ' (tenant default)' : ''}</option>)}</select></div>
        <div><label className="label" htmlFor="mx">Matrix x-axis</label>
          <select id="mx" name="mx" defaultValue={mx} className="input w-auto py-1 text-xs"><option value="gpv">Volume (GPV)</option><option value="net">Net revenue</option></select></div>
        <button className="btn-primary py-1 text-xs" type="submit">Apply</button>
        <span className="text-2xs text-muted">Overhead pool {fmtMoney(econ.overheadPool)} (GL opex + D&amp;A, {period.label}) · allocation {ALLOC_LABEL[econ.allocation]}</span>
      </form>

      <div className="grid gap-3 lg:grid-cols-3">
        {marginDecl.slice(0, 3).map((a) => (
          <Callout key={a.merchantId} tone="neg" title={`Margin alert — ${a.name}`}>
            {monthLabel(a.month)} unit contribution {a.unitMarginBps} bps vs {a.baselineUnitMarginBps} bps (6-month baseline, {fmtPct(a.changePct)}); impact ≈ {fmtMoney(a.change)} this month. Driver: <b>{a.primaryDriver}</b> (wholesale {dec(a.drivers.wholesaleBps).gte(0) ? '+' : ''}{a.drivers.wholesaleBps} bps, MDR {a.drivers.mdrBps} bps). <Link className="link" href={`/merchants/${a.merchantId}?range=${range}`}>Investigate →</Link>
          </Callout>
        ))}
        {loss.length > 0 && (
          <Callout tone="warn" title={`${loss.length} loss-making merchant(s) at contribution level — ${monthLabel(endMonth)}`}>
            {loss.slice(0, 4).map((a) => <div key={a.merchantId}><Link className="link" href={`/merchants/${a.merchantId}?range=${range}`}>{a.name}</Link>: {fmtMoney(a.contribution)} ({a.unitMarginBps} bps)</div>)}
          </Callout>
        )}
        {alerts.length === 0 && <Callout tone="pos" title={`No margin alerts for ${monthLabel(endMonth)}`}>Threshold: unit margin down more than {fmtPct(threshold, 0)} vs the 6-month baseline.</Callout>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="GPV (processed, not revenue)" value={fmtMoney(T.gpv, 'MUR', { compact: true })} sub={`${fmtNumber(T.successes)} successful txns`} />
        <Stat label="Gross acquiring fees" value={fmtMoney(T.mdr, 'MUR', { compact: true })} sub={`Eff. MDR ${fmtBps(T.effectiveMdrBps)}`} />
        <Stat label="Wholesale cost" value={fmtMoney(T.wholesale, 'MUR', { compact: true })} sub={`${fmtBps(T.wholesaleBps)} of GPV`} />
        <Stat label="Recognised revenue" value={fmtMoney(T.recognisedRevenue ?? T.netRevenue, 'MUR', { compact: true })} sub={econ.policy === 'principal_gross' ? 'principal (gross)' : `agent (net) · take rate ${fmtBps(T.takeRateBps)}`} />
        <Stat label="Contribution" value={fmtMoney(T.contribution, 'MUR', { compact: true })} sub={`${fmtPct(T.contributionPct)} of net revenue`} tone={dec(T.contribution).lt(0) ? 'neg' : undefined} />
        <Stat label="Allocated overhead" value={fmtMoney(T.overhead, 'MUR', { compact: true })} sub={ALLOC_LABEL[econ.allocation]} />
        <Stat label="Net profitability" value={fmtMoney(T.netProfit, 'MUR', { compact: true })} tone={dec(T.netProfit).lt(0) ? 'neg' : 'pos'} />
        <Stat label="Revenue / cost per txn" value={`${fmtMoney(T.revenuePerTxn, 'MUR', { dp: 2 })}`} sub={`cost ${fmtMoney(T.costPerTxn, 'MUR', { dp: 2 })} (wholesale + processing)`} />
      </div>

      <Section title={`Profitability by ${g.label.toLowerCase()}`}>
        <Card>
          <DataTable rows={rows} columns={cols} filename={`merchant-economics-${groupBy}-${period.key}`} pageSize={50} dense
            footer={{ ...T, name: 'Total (Σ rows)', segment: '' }} />
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">Totals reconciliation {allOk ? <Badge tone="pos">Σ rows = total = source</Badge> : <Badge tone="neg">Difference</Badge>}</div>
            <div className="overflow-x-auto"><table className="text-xs">
              <thead><tr><th className="th">Measure</th><th className="th text-right">Σ of {econ.rows.length} rows</th><th className="th text-right">Total row</th><th className="th text-right">Source control total</th><th className="th text-right">Difference</th><th className="th">Note</th></tr></thead>
              <tbody>{checks.map((c) => { const f = (v: string) => (c.count ? fmtNumber(v) : fmtMoney(v, 'MUR', { dp: 2 })); const diff = c.rows.minus(c.source); return (
                <tr key={c.label}><td className="td">{c.label}</td><td className="td num text-right">{f(c.rows.toString())}</td><td className="td num text-right">{f(c.total.toString())}</td><td className="td num text-right">{f(c.source.toString())}</td><td className={`td num text-right ${diff.isZero() && c.rows.eq(c.total) ? 'text-pos' : 'text-neg'}`}>{f(diff.toString())}</td><td className="td text-muted">{c.note ?? ''}</td></tr>); })}</tbody>
            </table></div>
            <p className="mt-2 text-2xs text-muted">Source control totals are recomputed directly from <code>transactions</code> (accounting date {period.start} → {period.end}), the SaaS CTE over <code>pricing_agreements</code> and the GL overhead pool. Allocation residuals from rounding are assigned to the largest unit so allocations sum exactly to the pool. Effective MDR = MDR ÷ GPV; take rate = (MDR − wholesale) ÷ GPV; cost / txn = (wholesale + processing) ÷ successful txns.</p>
          </div>
        </Card>
      </Section>

      <Section title="Merchant segmentation & profitability matrix">
        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title={`Profitability matrix — ${mx === 'gpv' ? 'volume' : 'net revenue'} × contribution margin (bps of GPV)`} subtitle="Bubble size = net revenue. Click a point to open the merchant. Lines: median volume and the portfolio contribution margin." />
            <CardBody>{points.length ? <ProfitabilityMatrix points={points} xRef={xRef} yRef={seg.thresholds.portfolioUnitMarginBps} xMode={mx} range={period.key} xTitle={mx === 'gpv' ? 'GPV (MUR)' : 'Net revenue (MUR)'} /> : <EmptyState title="No merchant volume in this period" />}</CardBody>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Quadrants" subtitle={`High margin ≥ ${fmtBps(seg.thresholds.portfolioUnitMarginBps)} (portfolio) · high volume ≥ ${fmtMoney(seg.thresholds.medianGpv, 'MUR', { compact: true })} (median GPV)`} />
            <CardBody className="grid grid-cols-2 gap-2">
              <Q title="High margin · low volume" sub="Develop volume" items={quad(true, false)} />
              <Q title="High margin · high volume" sub="Core franchise" items={quad(true, true)} />
              <Q title="Low margin · low volume" sub="Restructure / monitor" items={quad(false, false)} />
              <Q title="Low margin · high volume" sub="Reprice / optimise routing" items={quad(false, true)} />
              <div className="col-span-2 flex flex-wrap gap-2 pt-1 text-2xs">{(Object.keys(SEGMENTS) as SegmentCode[]).map((k) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SEGMENT_COLORS[k] }} />{SEGMENTS[k].label}: <b>{seg.counts[k]}</b></span>)}</div>
            </CardBody>
          </Card>
        </div>
        <Card className="mt-4">
          <CardHeader title="Segment assignments" subtitle="SEGMENT v1 rules: revenue contribution, contribution margin, volume, growth (last 3 vs prior 3 months), commercial importance, churn risk and concentration (share of net revenue ≥ 10 %). Thresholds are portfolio-relative." />
          <DataTable rows={seg.rows.map((r) => ({ ...r, reasonsText: r.reasons.join('; '), flagsText: r.flags.join('; ') }))} filename={`merchant-segments-${period.key}`} pageSize={40} dense columns={[
            { key: 'name', label: 'Merchant', href: `/merchants/{id}?range=${encodeURIComponent(period.key)}` }, { key: 'segmentLabel', label: 'Segment' }, { key: 'netRevenue', label: 'Net revenue', kind: 'money' },
            { key: 'revenueShare', label: 'Share', kind: 'pct' }, { key: 'unitMarginBps', label: 'CM bps of GPV', kind: 'bps' }, { key: 'gpv', label: 'GPV', kind: 'money' }, { key: 'growth', label: 'Growth (3m)', kind: 'pct' },
            { key: 'commercialImportance', label: 'Importance', kind: 'number' }, { key: 'churnRisk', label: 'Churn risk', kind: 'number' }, { key: 'reasonsText', label: 'Why' }, { key: 'flagsText', label: 'Flags' }, { key: 'action', label: 'Recommended action' },
          ]} />
        </Card>
      </Section>

      <Section title="Pricing opportunities (commercially constrained)">
        {opps.length === 0 ? <EmptyState title="No repricing or routing candidates in this period" /> : (
          <Card>
            <div className="grid grid-cols-12 gap-2 border-b border-border bg-surface-2 px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-muted">
              <div className="col-span-4">Merchant · recommendation</div><div className="col-span-2">Status</div><div className="col-span-2 text-right">Suggested MDR Δ</div><div className="col-span-2 text-right">Impact / month</div><div className="col-span-2 text-right">Break-even churn</div>
            </div>
            {opps.map((o) => (
              <details key={o.id} className="group border-b border-border last:border-0">
                <summary className="grid cursor-pointer list-none grid-cols-12 items-center gap-2 px-4 py-2 text-sm hover:bg-surface-2">
                  <div className="col-span-4 min-w-0"><span className="mr-1 text-muted group-open:rotate-90 inline-block">›</span><b>{o.name}</b><div className="truncate text-2xs text-muted" title={o.recommendation}>{o.recommendation}</div></div>
                  <div className="col-span-2 flex flex-wrap gap-1">{o.status === 'constrained' ? <Badge tone="warn" title={o.constraint ?? ''}>Contractually constrained</Badge> : <Badge tone="info">Candidate</Badge>}<Badge>{o.kind}</Badge></div>
                  <div className="col-span-2 num text-right">{o.suggestedMdrChangeBps ? `+${o.suggestedMdrChangeBps} bps (+${dec(o.suggestedMdrChangeBps).div(100).toFixed(2)} pp)` : '—'}</div>
                  <div className="col-span-2 num text-right">{o.monthlyImpact ? fmtMoney(o.monthlyImpact) : '—'}</div>
                  <div className="col-span-2 num text-right">{fmtPct(o.breakEvenChurnProbability)}</div>
                </summary>
                <div className="grid gap-3 px-8 pb-3 text-xs md:grid-cols-2">
                  {o.constraint && <div className="md:col-span-2 rounded border border-warn/40 bg-warn/5 p-2"><b className="text-warn">Constraint:</b> {o.constraint}</div>}
                  <div><div className="font-semibold">Evidence</div><ul className="ml-4 list-disc text-muted">{o.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                  <div><div className="font-semibold">Uncertainty</div><ul className="ml-4 list-disc text-muted">{o.uncertainty.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                  <div className="md:col-span-2"><Link className="link" href={`/merchants/${o.id}?range=${range}${o.suggestedMdrChangeBps ? `&mdr=${o.suggestedMdrChangeBps}` : ''}#simulate`}>Open merchant and simulate {o.suggestedMdrChangeBps ? `+${o.suggestedMdrChangeBps} bps` : ''} →</Link> <span className="text-muted">(impact = average monthly GPV × bps, before churn)</span></div>
                </div>
              </details>
            ))}
          </Card>
        )}
        <p className="mt-2 text-2xs text-muted">A merchant is contractually constrained when <code>price_locked_until</code> is after {today} or contract notes exist; such merchants are never recommended for immediate repricing. Rates: 1 bp = 0.01 percentage point. Trends compare the latest month ({monthLabel(endMonth)}) with the 3 preceding months.</p>
      </Section>
    </div>
  );
}
