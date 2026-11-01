import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { revenueBy, toBridgeInput, engineMonthly, glRevenueStreams, glAccountMonthly, growthRates, lastActualMonth, comparisonRange, REVENUE_DIMS, s, type RevenueDim, seq } from '@/lib/services/finance';
import { tenantInfo, policyOf } from '@/lib/services/facts';
import { revenueBridge, concentration } from '@/lib/engine/bridge';
import { PageHeader, Callout, Section } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendChart, Waterfall, HBarChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { FinanceNav, Provenance, Stat, VarAmt } from '../financial-performance/_components/finance-ui';
import { ParamSelect } from '../financial-performance/_components/param-select';
import { trailingMonths } from '@/lib/period';
import { monthEnd, monthStart } from '@/lib/dates';
import { fmtMoney, fmtPct, fmtNumber, fmtBps, monthLabel } from '@/lib/format';
import { dec, safeDiv, sum, pctChange } from '@/lib/money';

export const dynamic = 'force-dynamic';
const MERCHANT_GROUPBY: Partial<Record<RevenueDim, string>> = { product: 'product', acquirer: 'acquirer', method: 'method', currency: 'txn_currency', segment: 'segment', vertical: 'vertical', region: 'region' };

export default async function RevenueIntelligence({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'finance.view');
  const compare = spGet(sp, 'compare') === 'yoy' ? 'yoy' : 'prior';
  const by = ((Object.keys(REVENUE_DIMS) as RevenueDim[]).find((d) => d === spGet(sp, 'by')) ?? 'merchant') as RevenueDim;
  const data = await tx(auth, async (t) => {
    const policy = policyOf(await tenantInfo(t));
    const last = (await lastActualMonth(t, period.end)) ?? monthStart(period.end);
    const end = monthEnd(last) < period.end && monthEnd(last) >= period.start ? monthEnd(last) : period.end;
    const cmp = comparisonRange(period.start, end, compare);
    const [mCur, mCmp] = await seq(() => revenueBy(t, period.start, end, 'merchant', policy), () => revenueBy(t, cmp.start, cmp.end, 'merchant', policy));
    const [dCur, dCmp] = by === 'merchant' ? [mCur, mCmp] : await seq(() => revenueBy(t, period.start, end, by, policy), () => revenueBy(t, cmp.start, cmp.end, by, policy));
    const trail = trailingMonths(last, 18);
    const [eng, glRev, streams, streamsCur] = await seq(() => engineMonthly(t, addYearsSafe(trail[0], -1), monthEnd(last), policy), () => glAccountMonthly(t, addYearsSafe(trail[0], -1), monthEnd(last)), () => glRevenueStreams(t, trail[0], monthEnd(last)), () => glRevenueStreams(t, period.start, end));
    return { policy, last, end, cmp, mCur, mCmp, dCur, dCmp, trail, eng, glRev, streams, streamsCur };
  });
  const { policy, last, end, cmp, mCur, mCmp, dCur, dCmp, trail, eng, glRev, streams, streamsCur } = data;

  // ---- growth (GL revenue and engine revenue)
  const glByMonth = new Map<string, string>();
  for (const r of glRev.filter((x) => x.pl_line === 'revenue')) glByMonth.set(r.period, dec(glByMonth.get(r.period) ?? 0).plus(r.amount).toString());
  const engByMonth = new Map(eng.map((e) => [e.period, e.revenue]));
  const gpvByMonth = new Map(eng.map((e) => [e.period, e.gpv]));
  const gGl = growthRates(glByMonth, last), gEng = growthRates(engByMonth, last), gGpv = growthRates(gpvByMonth, last);

  // ---- bridge (comparison → current) at merchant level
  const bridge = revenueBridge(toBridgeInput(mCmp), toBridgeInput(mCur));
  const steps = [
    { label: `Start (${cmp.start.slice(0, 7)})`, value: bridge.start.toString(), total: true },
    { label: 'New merchants', value: bridge.newMerchants.toString() },
    { label: 'Lost merchants', value: bridge.lostMerchants.toString() },
    { label: 'Txn count', value: bridge.txnCountEffect.toString() },
    { label: 'Avg ticket', value: bridge.avgTicketEffect.toString() },
    { label: 'Rate / price', value: bridge.rateEffect.toString() },
    { label: 'SaaS / other', value: bridge.otherRevenueEffect.toString() },
    { label: `End (${end.slice(0, 7)})`, value: bridge.end.toString(), total: true },
  ];
  const mName = new Map([...mCur, ...mCmp].map((m) => [m.key, m]));
  const newM = bridge.byMerchant.filter((b) => b.kind === 'new').map((b) => ({ id: b.key, name: mName.get(b.key)?.name ?? b.key, delta: b.delta.toString(), activated: mName.get(b.key)?.activated_at ?? null }));
  const lostM = bridge.byMerchant.filter((b) => b.kind === 'lost').map((b) => ({ id: b.key, name: mName.get(b.key)?.name ?? b.key, delta: b.delta.toString(), churned: mName.get(b.key)?.churned_at ?? null }));
  const movers = bridge.byMerchant.filter((b) => b.kind === 'continuing').slice(0, 10).map((b) => ({ id: b.key, name: mName.get(b.key)?.name ?? b.key, delta: b.delta.toString(), volume: b.volume.toString(), rate: b.rate.toString() }));

  // ---- concentration
  const conc = concentration(mCur.map((m) => m.revenue));
  const concPrev = concentration(mCmp.map((m) => m.revenue));

  // ---- GPV vs revenue (period totals)
  const tot = (rows: typeof mCur) => ({ gpv: sum(rows.map((r) => r.gpv)), txn: sum(rows.map((r) => r.txnRevenue)), rev: sum(rows.map((r) => r.revenue)), saas: sum(rows.map((r) => r.saas)), mdr: sum(rows.map((r) => r.mdr)), wh: sum(rows.map((r) => r.wholesale)), succ: sum(rows.map((r) => r.successes)) });
  const A = tot(mCur), B = tot(mCmp);
  const take = (x: typeof A) => safeDiv(x.mdr.minus(x.wh), x.gpv);
  const takeA = take(A), takeB = take(B);
  const gpvG = pctChange(A.gpv, B.gpv), txnG = pctChange(A.txn, B.txn), revG = pctChange(A.rev, B.rev);
  const takeDeltaBps = takeA && takeB ? takeA.minus(takeB).times(10000) : null;

  // ---- dimension table
  const cmpMap = new Map(dCmp.map((r) => [r.key, r]));
  const dimTotal = sum(dCur.map((r) => r.revenue));
  const dimRows = dCur.map((r) => {
    const p = cmpMap.get(r.key);
    return { ...r, share: s(safeDiv(r.revenue, dimTotal), 6), prior: p?.revenue ?? '0', delta: dec(r.revenue).minus(p?.revenue ?? 0).toString(), deltaPct: s(pctChange(r.revenue, p?.revenue ?? 0), 6), status: r.churned_at && r.churned_at <= end ? 'churned' : r.activated_at && r.activated_at >= cmp.start ? 'new' : '' };
  });
  for (const p of dCmp) if (!dCur.find((r) => r.key === p.key)) dimRows.push({ ...p, gpv: '0', successes: '0', attempts: '0', mdr: '0', wholesale: '0', processing: '0', saas: '0', txnRevenue: '0', revenue: '0', takeRateBps: null, share: '0', prior: p.revenue, delta: dec(p.revenue).neg().toString(), deltaPct: '-1', status: 'lost' });

  // ---- trends
  const trend = trail.map((m) => {
    const e = eng.find((x) => x.period === m);
    return { month: monthLabel(m), gl: glByMonth.get(m) ?? '0', engine: e?.revenue ?? '0', gpv: e?.gpv ?? '0', take: e?.takeRateBps ? dec(e.takeRateBps).div(10000).toString() : null };
  });
  const streamKeys = Array.from(new Set(streams.map((x) => x.stream))).sort();
  const streamTrend = trail.map((m) => { const o: Record<string, string> = { month: monthLabel(m) }; for (const k of streamKeys) o[k] = sum(streams.filter((x) => x.period === m && x.stream === k).map((x) => x.amount)).toString(); return o; });
  const streamTot = new Map<string, string>(); for (const r of streamsCur) streamTot.set(r.stream, dec(streamTot.get(r.stream) ?? 0).plus(r.amount).toString());
  const productGl = new Map<string, string>(); for (const r of streamsCur) { const k = r.product ?? `${r.stream} (no product tag)`; productGl.set(k, dec(productGl.get(k) ?? 0).plus(r.amount).toString()); }

  // ---- engine vs GL for the selected period
  const glPeriod = sum(streamsCur.map((r) => r.amount));
  const glOther = sum(streamsCur.filter((r) => r.stream === 'OTHER').map((r) => r.amount));
  const engVsGl = glPeriod.minus(glOther).minus(A.rev);
  const pc = (v: ReturnType<typeof pctChange>) => fmtPct(s(v, 6));
  const ccy = auth.baseCurrency;

  return (
    <div>
      <PageHeader eyebrow="Finance" title={`Revenue intelligence — ${period.label}`}
        subtitle={<>Transaction-engine revenue (policy <b>{policy === 'agent_net' ? 'agent / net: MDR − wholesale' : 'principal / gross: MDR'}</b>, plus SaaS fees) and GL revenue streams. Compared with {compare === 'yoy' ? 'the same period last year' : 'the prior period'} ({cmp.start} → {cmp.end}). GPV is money processed for merchants — it is never revenue.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} />} />
      <FinanceNav current="/revenue" range={period.key} />

      <div className="grid gap-3 lg:grid-cols-2">
        {!engVsGl.abs().lte(1) && <Callout tone="neg" title={`DISPUTED — GL transaction revenue differs from the fee engine by ${fmtMoney(engVsGl.toString(), ccy, { dp: 2 })}`}>GL revenue excl. payouts/recon services {fmtMoney(glPeriod.minus(glOther).toString(), ccy, { dp: 2 })} vs engine {fmtMoney(A.rev.toString(), ccy, { dp: 2 })} for {period.start} → {end}. This is the control C07 break (e.g. the August 2026 under-booking); it is displayed, not adjusted. <Link className="link" href={`/pnl/entries?account=4000&range=${encodeURIComponent(period.key)}`}>GL journals →</Link></Callout>}
        {takeDeltaBps && takeDeltaBps.lt(0) && gpvG && revG && gpvG.gt(revG) && <Callout tone="warn" title="Volume growth is not revenue growth">GPV {gpvG.gte(0) ? 'grew' : 'fell'} {pc(gpvG)} while transaction revenue changed {pc(txnG)}: the net take rate moved {fmtBps(takeDeltaBps.toString())} ({fmtBps(takeB ? takeB.times(10000).toString() : null)} → {fmtBps(takeA ? takeA.times(10000).toString() : null)}). Rate/price effect in the bridge: {fmtMoney(bridge.rateEffect.toString(), ccy)}.</Callout>}
      </div>

      <Section title={`Growth at ${monthLabel(last)} (last booked month of the selected period)`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="GL revenue MoM" value={pc(gGl.mom)} sub={`${fmtMoney(s(gGl.current), ccy, { compact: true })} vs ${fmtMoney(s(gGl.previous), ccy, { compact: true })}`} tone={gGl.mom?.lt(0) ? 'neg' : 'pos'} />
          <Stat label="GL revenue QoQ (3 m)" value={pc(gGl.qoq)} sub={`${fmtMoney(s(gGl.quarter), ccy, { compact: true })} vs ${fmtMoney(s(gGl.prevQuarter), ccy, { compact: true })}`} tone={gGl.qoq?.lt(0) ? 'neg' : 'pos'} />
          <Stat label="GL revenue YoY" value={pc(gGl.yoy)} sub={`vs ${fmtMoney(s(gGl.lastYear), ccy, { compact: true })}`} tone={gGl.yoy?.lt(0) ? 'neg' : 'pos'} />
          <Stat label="Engine revenue MoM / QoQ / YoY" value={<span className="text-base">{pc(gEng.mom)} · {pc(gEng.qoq)} · {pc(gEng.yoy)}</span>} sub="MDR − wholesale + SaaS" />
          <Stat label="GPV MoM / QoQ / YoY" value={<span className="text-base">{pc(gGpv.mom)} · {pc(gGpv.qoq)} · {pc(gGpv.yoy)}</span>} sub="processed value — not revenue" />
          <Stat label="Revenue concentration (HHI)" value={conc.hhi ? fmtNumber(conc.hhi.toString(), 0) : '—'} sub={`top-5 ${fmtPct(s(conc.topShare, 6))} · top-1 ${fmtPct(s(conc.top1Share, 6))} (was ${concPrev.hhi ? fmtNumber(concPrev.hhi.toString(), 0) : '—'})`} tone={conc.hhi && conc.hhi.gt(2500) ? 'warn' : undefined} />
        </div>
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={`Revenue bridge ${cmp.start.slice(0, 7)}${cmp.end.slice(0, 7) !== cmp.start.slice(0, 7) ? '…' + cmp.end.slice(0, 7) : ''} → ${period.start.slice(0, 7)}${end.slice(0, 7) !== period.start.slice(0, 7) ? '…' + end.slice(0, 7) : ''}`} subtitle="engine/bridge revenueBridge: new / lost merchants, volume (transaction count, average ticket), rate/price, SaaS & other" />
          <CardBody>
            <Waterfall steps={steps} height={280} />
            <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><tbody>
              {steps.map((st) => <tr key={st.label}><td className="td">{st.label}</td><td className="td text-right num">{st.total ? fmtMoney(st.value, ccy) : <VarAmt v={st.value} favourable={dec(st.value).isZero() ? null : dec(st.value).gt(0)} />}</td></tr>)}
              <tr><td className="td text-2xs text-muted">Bridge check (end − start − Σ effects)</td><td className={`td text-right num text-2xs ${bridge.check.abs().lt('0.01') ? 'text-pos' : 'text-neg'}`}>{bridge.check.toDecimalPlaces(6).toString()}</td></tr>
            </tbody></table></div>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="GPV growth vs revenue growth" subtitle={`${period.start} → ${end} vs ${cmp.start} → ${cmp.end}`} />
          <CardBody>
            <table className="w-full text-sm"><thead><tr><th className="th">Measure</th><th className="th text-right">Current</th><th className="th text-right">Comparison</th><th className="th text-right">Δ %</th></tr></thead><tbody>
              <tr><td className="td">GPV (processed, not revenue)</td><td className="td text-right num">{fmtMoney(A.gpv.toString(), ccy, { compact: true })}</td><td className="td text-right num">{fmtMoney(B.gpv.toString(), ccy, { compact: true })}</td><td className="td text-right num">{pc(gpvG)}</td></tr>
              <tr><td className="td">Successful transactions</td><td className="td text-right num">{fmtNumber(A.succ.toString())}</td><td className="td text-right num">{fmtNumber(B.succ.toString())}</td><td className="td text-right num">{pc(pctChange(A.succ, B.succ))}</td></tr>
              <tr><td className="td">Gross fees (MDR)</td><td className="td text-right num">{fmtMoney(A.mdr.toString(), ccy, { compact: true })}</td><td className="td text-right num">{fmtMoney(B.mdr.toString(), ccy, { compact: true })}</td><td className="td text-right num">{pc(pctChange(A.mdr, B.mdr))}</td></tr>
              <tr><td className="td">Wholesale cost</td><td className="td text-right num">{fmtMoney(A.wh.toString(), ccy, { compact: true })}</td><td className="td text-right num">{fmtMoney(B.wh.toString(), ccy, { compact: true })}</td><td className="td text-right num">{pc(pctChange(A.wh, B.wh))}</td></tr>
              <tr className="font-semibold"><td className="td">Transaction revenue</td><td className="td text-right num">{fmtMoney(A.txn.toString(), ccy, { compact: true })}</td><td className="td text-right num">{fmtMoney(B.txn.toString(), ccy, { compact: true })}</td><td className="td text-right num">{pc(txnG)}</td></tr>
              <tr><td className="td">SaaS revenue</td><td className="td text-right num">{fmtMoney(A.saas.toString(), ccy, { compact: true })}</td><td className="td text-right num">{fmtMoney(B.saas.toString(), ccy, { compact: true })}</td><td className="td text-right num">{pc(pctChange(A.saas, B.saas))}</td></tr>
              <tr className="font-semibold"><td className="td">Total engine revenue</td><td className="td text-right num">{fmtMoney(A.rev.toString(), ccy, { compact: true })}</td><td className="td text-right num">{fmtMoney(B.rev.toString(), ccy, { compact: true })}</td><td className="td text-right num">{pc(revG)}</td></tr>
              <tr><td className="td">Net take rate</td><td className="td text-right num">{fmtBps(takeA ? takeA.times(10000).toString() : null)}</td><td className="td text-right num">{fmtBps(takeB ? takeB.times(10000).toString() : null)}</td><td className="td text-right num">{takeDeltaBps ? `${takeDeltaBps.gt(0) ? '+' : ''}${takeDeltaBps.toDecimalPlaces(1).toFixed(1)} bps` : '—'}</td></tr>
            </tbody></table>
            <p className="mt-3 text-xs text-muted">Revenue growth − GPV growth = <b className="num">{revG && gpvG ? `${revG.minus(gpvG).times(100).toDecimalPlaces(1).toFixed(1)} pp` : '—'}</b>. A negative gap means each unit of processed value earns less (pricing, mix, or wholesale cost — e.g. the SBM international wholesale increase from Sep 2026).</p>
            <div className="mt-2 flex gap-2 text-xs"><Link className="link" href={`/proof/kpi/PAY.GPV?range=${encodeURIComponent(period.key)}`}>PAY.GPV proof</Link><Link className="link" href={`/proof/kpi/PAY.TAKE_RATE?range=${encodeURIComponent(period.key)}`}>PAY.TAKE_RATE proof</Link><Link className="link" href={`/proof/kpi/PAY.NET_REVENUE?range=${encodeURIComponent(period.key)}`}>PAY.NET_REVENUE proof</Link></div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card><CardHeader title={`New merchants (${newM.length})`} subtitle={`Revenue in current period, none in comparison · +${fmtMoney(bridge.newMerchants.toString(), ccy)}`} />
          <DataTable rows={newM} filename="revenue-new-merchants" pageSize={10} dense searchable={false} columns={[{ key: 'name', label: 'Merchant', href: '/merchants/{id}' }, { key: 'activated', label: 'Activated', kind: 'date' }, { key: 'delta', label: 'Revenue', kind: 'money' }]} /></Card>
        <Card><CardHeader title={`Lost merchants (${lostM.length})`} subtitle={`Revenue in comparison, none now · ${fmtMoney(bridge.lostMerchants.toString(), ccy)}`} />
          <DataTable rows={lostM} filename="revenue-lost-merchants" pageSize={10} dense searchable={false} columns={[{ key: 'name', label: 'Merchant', href: '/merchants/{id}' }, { key: 'churned', label: 'Churned', kind: 'date' }, { key: 'delta', label: 'Revenue lost', kind: 'money' }]} /></Card>
        <Card><CardHeader title="Largest movers (continuing merchants)" subtitle="Δ revenue split into volume and rate effects" />
          <DataTable rows={movers} filename="revenue-movers" pageSize={10} dense searchable={false} columns={[{ key: 'name', label: 'Merchant', href: '/merchants/{id}' }, { key: 'delta', label: 'Δ revenue', kind: 'money' }, { key: 'volume', label: 'Volume', kind: 'money' }, { key: 'rate', label: 'Rate', kind: 'money' }]} /></Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Revenue by ${REVENUE_DIMS[by].label.toLowerCase()}`} subtitle={<>{period.start} → {end} vs comparison. {REVENUE_DIMS[by].merchantLevel ? 'SaaS fees attributed to merchants.' : 'SaaS is not attributable to this dimension and is shown as its own row.'} {MERCHANT_GROUPBY[by] && <Link className="link" href={`/merchants?groupBy=${MERCHANT_GROUPBY[by]}&range=${encodeURIComponent(period.key)}`}>Profitability by {REVENUE_DIMS[by].label.toLowerCase()} →</Link>}</>}
          actions={<ParamSelect name="by" label="Group by" value={by} options={(Object.keys(REVENUE_DIMS) as RevenueDim[]).map((d) => ({ value: d, label: REVENUE_DIMS[d].label }))} />} />
        <CardBody className="border-b border-border"><HBarChart data={dimRows.filter((r) => dec(r.revenue).gt(0)).slice(0, 12).map((r) => ({ label: r.name, v: r.revenue }))} labelKey="label" valueKey="v" /></CardBody>
        <DataTable rows={dimRows} filename={`revenue-by-${by}`} pageSize={25} dense columns={[
          { key: 'name', label: REVENUE_DIMS[by].label, ...(by === 'merchant' ? { href: '/merchants/{key}' } : {}) },
          { key: 'status', label: '', kind: 'badge' },
          { key: 'gpv', label: 'GPV', kind: 'money' }, { key: 'successes', label: 'Txns', kind: 'number' }, { key: 'mdr', label: 'MDR', kind: 'money' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' },
          { key: 'txnRevenue', label: 'Txn revenue', kind: 'money' }, { key: 'saas', label: 'SaaS', kind: 'money' }, { key: 'revenue', label: 'Revenue', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct' },
          { key: 'takeRateBps', label: 'Take rate bps', kind: 'bps' }, { key: 'prior', label: 'Comparison', kind: 'money' }, { key: 'delta', label: 'Δ', kind: 'money' }, { key: 'deltaPct', label: 'Δ %', kind: 'pct' },
        ]} footer={{ name: 'Total', gpv: sum(dimRows.map((r) => r.gpv)).toString(), successes: sum(dimRows.map((r) => r.successes)).toString(), mdr: sum(dimRows.map((r) => r.mdr)).toString(), wholesale: sum(dimRows.map((r) => r.wholesale)).toString(), txnRevenue: sum(dimRows.map((r) => r.txnRevenue)).toString(), saas: sum(dimRows.map((r) => r.saas)).toString(), revenue: dimTotal.toString(), prior: sum(dimRows.map((r) => r.prior)).toString(), delta: sum(dimRows.map((r) => r.delta)).toString() }} />
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="GL revenue vs transaction engine — 18 months" subtitle="The August 2026 gap is the known under-booking (C07, DISPUTED)" />
          <CardBody><TrendChart data={trend} x="month" series={[{ key: 'gl', label: 'GL revenue', type: 'bar' }, { key: 'engine', label: 'Engine revenue (excl. payouts/recon)', type: 'line', color: '#b8923d' }]} /></CardBody></Card>
        <Card><CardHeader title="GPV vs net take rate — 18 months" subtitle="GPV (bars, left) and net take rate (line, right axis, fraction)" />
          <CardBody><TrendChart data={trend.map((r) => ({ ...r, takeBps: r.take ? dec(r.take).times(10000).toString() : null }))} x="month" series={[{ key: 'gpv', label: 'GPV', type: 'bar', color: '#64748b' }, { key: 'takeBps', label: 'Take rate (bps, right)', type: 'line', yAxis: 'right', color: '#c43131' }]} /></CardBody></Card>
        <Card><CardHeader title="GL revenue streams — 18 months" subtitle="chart_of_accounts.revenue_stream (TXN / SAAS / OTHER)" />
          <CardBody><TrendChart data={streamTrend} x="month" series={streamKeys.map((k, i) => ({ key: k, label: k, type: 'bar' as const, stack: 's', color: ['#173166', '#b8923d', '#168052', '#7c3aed'][i % 4] }))} /></CardBody></Card>
        <Card><CardHeader title="GL revenue by stream and product tag" subtitle={`${period.start} → ${end}; GL lines carry product_id for transactional revenue`} />
          <CardBody>
            <div className="mb-3 flex flex-wrap gap-2">{[...streamTot.entries()].map(([k, v]) => <Badge key={k} tone="navy">{k}: {fmtMoney(v, ccy, { compact: true })}</Badge>)}<Badge tone="gold">Total GL: {fmtMoney(glPeriod.toString(), ccy, { compact: true })}</Badge></div>
            <HBarChart data={[...productGl.entries()].sort((a, b) => dec(b[1]).cmp(dec(a[1]))).map(([k, v]) => ({ label: k, v }))} labelKey="label" valueKey="v" color="#b8923d" />
          </CardBody></Card>
      </div>
      <Provenance>Sources: transactions (accounting_date basis; MDR, wholesale, GPV on successful transactions), pricing_agreements (monthly SaaS fee, SAAS_CTE), gl_entries ⨝ chart_of_accounts (pl_line = revenue). Bridge: engine/bridge.ts — volume effect = ΔGPV × prior take rate (split into transaction-count and average-ticket effects), rate effect = Δ take rate × current GPV. Concentration: HHI on merchant revenue shares (0–10,000; &gt; 2,500 = highly concentrated). Comparison totals: {fmtMoney(B.rev.toString(), ccy)}; current {fmtMoney(A.rev.toString(), ccy)}.</Provenance>
    </div>
  );
}

function addYearsSafe(d: string, n: number): string { return `${Number(d.slice(0, 4)) + n}${d.slice(4, 7)}-01`; }
