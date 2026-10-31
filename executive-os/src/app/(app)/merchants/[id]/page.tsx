import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { economicsBy, merchantInfo, merchantMonthly, merchantRateBreakdown, merchantFeeSchedules, merchantAgreements } from '@/lib/services/merchants';
import { decomposeContribution, contractConstraint, parseDecimalInput, trendMetrics } from '@/lib/services/segmentation';
import { simulatePricing, baseResult, pricingLadder, breakEvenVolumeForPriceChange, type PricingBase, type PricingChange } from '@/lib/engine/pricing';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TrendChart, Waterfall } from '@/components/ui/charts';
import { Badge } from '@/components/ui/badge';
import { MerchantTabs, MerchantBadges } from './tabs';
import { Stat, KeepParams, policyLabel } from '../shared';
import { addMonths, monthEnd, monthStart } from '@/lib/dates';
import { todayISO } from '@/lib/period';
import { fmtMoney, fmtPct, fmtBps, fmtNumber, monthLabel } from '@/lib/format';
import { dec, ZERO, type Dec } from '@/lib/money';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MerchantDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'merchant.view');
  const endMonth = monthStart(period.end);
  const fromMonth = addMonths(endMonth, -11);

  const d = await tx(auth, async (t) => {
    const m = await merchantInfo(t, id);
    if (!m) return null;
    const [econ, monthly, fees, agreements] = await Promise.all([
      economicsBy(t, period.start, period.end, 'merchant', { merchantId: id }),
      merchantMonthly(t, id, fromMonth, endMonth),
      merchantFeeSchedules(t, id, period.start, period.end),
      merchantAgreements(t, id),
    ]);
    return { m, econ, monthly, fees, agreements };
  });
  if (!d) notFound();
  const { m, econ, monthly, fees, agreements } = d;
  const range = period.key; const r = encodeURIComponent(range);
  const E = econ.rows[0] ?? econ.totals;
  const constraint = contractConstraint({ priceLockedUntil: m.price_locked_until, contractNotes: m.contract_notes }, todayISO());

  // ---- trend ----
  const unitBps = (x: any) => { const g = dec(x.gpv); return g.isZero() ? null : dec(x.mdr).minus(x.wholesale).minus(x.processing).div(g).times(10000).toDecimalPlaces(2).toString(); };
  const trendRows = monthly.map((x: any) => ({ ...x, label: monthLabel(x.month), mkey: String(x.month).slice(0, 7), unitMarginBps: unitBps(x) }));
  const trendCalc = trendMetrics(monthly);

  // ---- what changed ----
  const monthKeys = monthly.map((x: any) => x.month as string);
  const pickM = (k: string, fb: string) => { const v = spGet(sp, k); return v && monthKeys.includes(v) ? v : fb; };
  const bMonth = pickM('b', endMonth);
  const aMonth = pickM('a', monthKeys.includes(addMonths(bMonth, -1)) ? addMonths(bMonth, -1) : monthKeys[0]);
  const A = monthly.find((x: any) => x.month === aMonth)!, B = monthly.find((x: any) => x.month === bMonth)!;
  const bridge = decomposeContribution(A, B);
  const rates = await tx(auth, (t) => merchantRateBreakdown(t, id, aMonth < bMonth ? aMonth : bMonth, monthEnd(aMonth < bMonth ? bMonth : aMonth)));
  const rateRows = rates.filter((x: any) => x.month === aMonth || x.month === bMonth);
  const rateKeys = Array.from(new Set(rateRows.map((x: any) => `${x.acquirer}|${x.region}`))).sort();
  const rateCmp = rateKeys.map((k) => {
    const [acq, region] = k.split('|'); const ra = rateRows.find((x: any) => x.month === aMonth && `${x.acquirer}|${x.region}` === k); const rb = rateRows.find((x: any) => x.month === bMonth && `${x.acquirer}|${x.region}` === k);
    return { acq, region, a: ra, b: rb, delta: ra?.wholesale_bps && rb?.wholesale_bps ? dec(rb.wholesale_bps).minus(ra.wholesale_bps).toFixed(2) : null };
  });
  const effects = [
    { label: 'Volume (GPV) at base net margin', v: bridge.volume }, { label: 'MDR rate', v: bridge.mdrRate }, { label: 'Wholesale rate', v: bridge.wholesaleRate },
    { label: 'Direct processing', v: bridge.processing }, { label: 'SaaS fees', v: bridge.saas },
  ];
  const largest = [...effects].sort((x, y) => dec(x.v).abs().cmp(dec(y.v).abs()))[effects.length - 1];

  // ---- pricing simulation (trailing 3-month average) ----
  const last3 = monthly.slice(-3);
  const avg = (k: string) => last3.reduce((a: Dec, x: any) => a.plus(dec(x[k])), ZERO).div(Math.max(1, last3.length)).toDecimalPlaces(4).toString();
  const base: PricingBase = { gpv: avg('gpv'), successes: avg('successes'), mdr: avg('mdr'), wholesale: avg('wholesale'), processing: avg('processing'), saas: avg('saas') };
  const errors: string[] = [];
  const num = (k: string, label: string, range?: { min?: string; max?: string }) => { try { return parseDecimalInput(spGet(sp, k), label, range); } catch (e: any) { errors.push(e.message); return null; } };
  const inMdr = num('mdr', 'MDR change (bps)', { min: '-1000', max: '1000' }), inWh = num('wh', 'Wholesale change (bps)', { min: '-1000', max: '1000' }), inGrowth = num('growth', 'Volume growth (%)', { min: '-100', max: '1000' });
  const inMigShare = num('migShare', 'Migration share (%)', { min: '0', max: '100' }), inMigDelta = num('migDelta', 'Migration wholesale delta (bps)', { min: '-1000', max: '1000' }), inChurn = num('churn', 'Churn probability (%)', { min: '0', max: '100' });
  const change: PricingChange = { mdrChangeBps: (inMdr ?? ZERO).toString(), wholesaleChangeBps: (inWh ?? ZERO).toString(), volumeGrowthPct: (inGrowth ?? ZERO).div(100).toString(), migrateShare: (inMigShare ?? ZERO).div(100).toString(), migrateWholesaleDeltaBps: (inMigDelta ?? ZERO).toString(), churnProbability: (inChurn ?? ZERO).div(100).toString() };
  const b0 = baseResult(base);
  const sim = simulatePricing(base, change);
  const ladder = pricingLadder(base);
  const beVol = breakEvenVolumeForPriceChange(base, change.mdrChangeBps!);
  const effMdr = b0.effectiveMdrBps;
  const ex = effMdr ? `${effMdr.div(100).toFixed(2)} % → ${effMdr.minus(20).div(100).toFixed(2)} %` : '2.95 % → 2.75 %';
  const decisionHref = `/decisions/new?${new URLSearchParams({ template: 'merchant_repricing', merchantId: id, mdrChangeBps: change.mdrChangeBps!.toString(), wholesaleChangeBps: change.wholesaleChangeBps!.toString(), migrateShare: change.migrateShare!.toString(), migrateWholesaleDeltaBps: change.migrateWholesaleDeltaBps!.toString(), volumeGrowthPct: change.volumeGrowthPct!.toString(), churnProbability: change.churnProbability!.toString() }).toString()}`;
  const simRows: { label: string; b: Dec | null; s: Dec | null; kind: 'money' | 'bps' }[] = [
    { label: 'GPV (monthly)', b: b0.gpv, s: sim.gpv, kind: 'money' }, { label: 'Gross acquiring fees (MDR)', b: b0.mdr, s: sim.mdr, kind: 'money' }, { label: 'Wholesale cost', b: b0.wholesale, s: sim.wholesale, kind: 'money' },
    { label: 'Direct processing', b: b0.processing, s: sim.processing, kind: 'money' }, { label: 'SaaS fees', b: b0.saas, s: sim.saas, kind: 'money' },
    { label: 'MIPS net revenue (MDR − wholesale + SaaS)', b: b0.netRevenue, s: sim.netRevenue, kind: 'money' }, { label: 'Contribution', b: b0.contribution, s: sim.contribution, kind: 'money' },
    { label: 'Effective MDR', b: b0.effectiveMdrBps, s: sim.effectiveMdrBps, kind: 'bps' }, { label: 'Effective wholesale', b: b0.effectiveWholesaleBps, s: sim.effectiveWholesaleBps, kind: 'bps' }, { label: 'Take rate (MDR − wholesale)', b: b0.takeRateBps, s: sim.takeRateBps, kind: 'bps' },
  ];
  const fv = (v: Dec | null, k: 'money' | 'bps') => (v === null ? '—' : k === 'money' ? fmtMoney(v.toString(), 'MUR') : fmtBps(v.toString(), 2));
  const sign = (v: Dec | null, k: 'money' | 'bps') => (v === null ? '—' : `${v.gt(0) ? '+' : ''}${fv(v, k)}`);

  return (
    <div>
      <PageHeader eyebrow={`Merchant ${m.code}`} title={m.name} subtitle={<>Period {period.label} · revenue policy: {policyLabel(econ.policy)} · activated {m.activated_at ?? '—'}{m.churned_at ? ` · churned ${m.churned_at}` : ''}{m.contract_end_date ? ` · contract end ${m.contract_end_date}` : ''}</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      <MerchantTabs id={id} active="overview" range={range} />
      <div className="mb-4"><MerchantBadges m={m} /></div>
      {constraint && <div className="mb-4"><Callout tone="warn" title="Contractual constraint — not eligible for immediate repricing">{constraint}. Any repricing must follow the contract (notice period / review window). Simulations below are for preparation only.</Callout></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="GPV (processed)" value={fmtMoney(E.gpv, 'MUR', { compact: true })} sub={`${fmtNumber(E.successes)} successful · ${fmtPct(E.successRate)} success`} />
        <Stat label="Gross acquiring fees" value={fmtMoney(E.mdr, 'MUR', { compact: true })} sub={`Eff. MDR ${fmtBps(E.effectiveMdrBps)}`} />
        <Stat label="Wholesale" value={fmtMoney(E.wholesale, 'MUR', { compact: true })} sub={`${fmtBps(E.wholesaleBps)} of GPV`} />
        <Stat label="Net revenue (recognised)" value={fmtMoney(E.recognisedRevenue ?? E.netRevenue, 'MUR', { compact: true })} sub={`incl. SaaS ${fmtMoney(E.saas, 'MUR', { compact: true })} · take ${fmtBps(E.takeRateBps)}`} />
        <Stat label="Contribution" value={fmtMoney(E.contribution, 'MUR', { compact: true })} sub={`${fmtPct(E.contributionPct)} of net revenue`} tone={dec(E.contribution).lt(0) ? 'neg' : undefined} />
        <Stat label="Allocated overhead" value={fmtMoney(E.overhead, 'MUR', { compact: true })} sub={`portfolio share, ${econ.allocation.replace('_', ' ')}`} />
        <Stat label="Net profitability" value={fmtMoney(E.netProfit, 'MUR', { compact: true })} tone={dec(E.netProfit).lt(0) ? 'neg' : 'pos'} />
        <Stat label="Revenue / cost per txn" value={fmtMoney(E.revenuePerTxn, 'MUR', { dp: 2 })} sub={`cost ${fmtMoney(E.costPerTxn, 'MUR', { dp: 2 })}`} />
      </div>

      <Section title="Monthly economics — trailing 12 months">
        <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title="Net revenue and contribution vs GPV" subtitle="Bars: MIPS net revenue and contribution (left). Line: GPV processed (right axis, not revenue)." />
            <CardBody><TrendChart data={trendRows} x="label" series={[{ key: 'netRevenue', label: 'Net revenue', type: 'bar' }, { key: 'contribution', label: 'Contribution', type: 'bar', color: '#b8923d' }, { key: 'gpv', label: 'GPV (right)', type: 'line', yAxis: 'right', color: '#64748b' }]} /></CardBody></Card>
          <Card><CardHeader title="Rates (bps of GPV)" subtitle={`Effective MDR, wholesale and international wholesale. Latest vs 3-month baseline: wholesale ${trendCalc.wholesaleTrendBps ? `${dec(trendCalc.wholesaleTrendBps).gte(0) ? '+' : ''}${dec(trendCalc.wholesaleTrendBps).toFixed(1)} bps` : '—'}, unit margin ${trendCalc.unitMarginTrendBps ? `${dec(trendCalc.unitMarginTrendBps).toFixed(1)} bps` : '—'}.`} />
            <CardBody><TrendChart data={trendRows} x="label" series={[{ key: 'effectiveMdrBps', label: 'Effective MDR' }, { key: 'wholesaleBps', label: 'Wholesale' }, { key: 'intlWholesaleBps', label: 'International wholesale', color: '#c43131' }, { key: 'unitMarginBps', label: 'Unit margin (excl. SaaS)', color: '#168052' }]} /></CardBody></Card>
        </div>
        <Card className="mt-4">
          <DataTable rows={trendRows} filename={`${m.code}-monthly-economics`} pageSize={12} dense searchable rowHref={`/merchants/${id}?range=m:{mkey}`} columns={[
            { key: 'month', label: 'Month', kind: 'date' }, { key: 'gpv', label: 'GPV', kind: 'money' }, { key: 'successes', label: 'Success txns', kind: 'number' }, { key: 'mdr', label: 'MDR', kind: 'money' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' },
            { key: 'processing', label: 'Processing', kind: 'money' }, { key: 'saas', label: 'SaaS', kind: 'money' }, { key: 'netRevenue', label: 'Net revenue', kind: 'money' }, { key: 'contribution', label: 'Contribution', kind: 'money' },
            { key: 'effectiveMdrBps', label: 'Eff. MDR bps', kind: 'bps', dp: 2 }, { key: 'wholesaleBps', label: 'Wholesale bps', kind: 'bps', dp: 2 }, { key: 'intlWholesaleBps', label: 'Intl wholesale bps', kind: 'bps', dp: 2 }, { key: 'unitMarginBps', label: 'Unit margin bps', kind: 'bps', dp: 2 },
          ]} />
          <p className="border-t border-border px-4 py-2 text-2xs text-muted">Source: transactions aggregated by accounting month (merchantMonthly); SaaS from active pricing agreements. International wholesale bps = wholesale on international card transactions ÷ their successful GPV. Unit margin = (MDR − wholesale − processing) ÷ GPV.</p>
        </Card>
      </Section>

      <Section title="What changed — contribution bridge">
        <Card>
          <CardHeader title={`Contribution ${monthLabel(aMonth)} → ${monthLabel(bMonth)}: ${fmtMoney(bridge.contributionFrom)} → ${fmtMoney(bridge.contributionTo)} (${dec(bridge.change).gte(0) ? '+' : ''}${fmtMoney(bridge.change)})`}
            subtitle={<>Largest driver: <b>{largest.label}</b> ({fmtMoney(largest.v)}). Effects sum exactly to the change (check difference {fmtMoney(bridge.check, 'MUR', { dp: 4 })}).</>}
            actions={<form method="get" className="no-print flex items-end gap-2"><KeepParams sp={sp} except={['a', 'b']} />
              <select name="a" defaultValue={aMonth} aria-label="From month" className="input w-auto py-1 text-xs">{monthKeys.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</select>
              <span className="text-xs text-muted">→</span>
              <select name="b" defaultValue={bMonth} aria-label="To month" className="input w-auto py-1 text-xs">{monthKeys.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</select>
              <button className="btn py-1 text-xs">Compare</button></form>} />
          <CardBody className="grid gap-4 xl:grid-cols-2">
            <Waterfall steps={[{ label: monthLabel(aMonth), value: bridge.contributionFrom, total: true }, ...effects.map((e) => ({ label: e.label.split(' ')[0] === 'Volume' ? 'Volume' : e.label.replace('Direct ', '').replace(' fees', ''), value: e.v })), { label: monthLabel(bMonth), value: bridge.contributionTo, total: true }]} />
            <div>
              <table className="w-full text-sm"><tbody>
                <tr><td className="td">Contribution {monthLabel(aMonth)}</td><td className="td num text-right">{fmtMoney(bridge.contributionFrom, 'MUR', { dp: 2 })}</td></tr>
                {effects.map((e) => <tr key={e.label}><td className="td pl-6">{e.label}</td><td className={`td num text-right ${dec(e.v).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(e.v, 'MUR', { dp: 2 })}</td></tr>)}
                <tr className="font-semibold"><td className="td">Contribution {monthLabel(bMonth)}</td><td className="td num text-right">{fmtMoney(bridge.contributionTo, 'MUR', { dp: 2 })}</td></tr>
              </tbody></table>
              <p className="mt-2 text-2xs text-muted">GPV {fmtMoney(bridge.gpvFrom, 'MUR', { compact: true })} → {fmtMoney(bridge.gpvTo, 'MUR', { compact: true })}; MDR {fmtBps(bridge.mdrBpsFrom, 2)} → {fmtBps(bridge.mdrBpsTo, 2)}; wholesale {fmtBps(bridge.wholesaleBpsFrom, 2)} → {fmtBps(bridge.wholesaleBpsTo, 2)}. Volume = ΔGPV × base (MDR − wholesale)/GPV; MDR rate = GPV₁ × ΔMDR bps; wholesale rate = −GPV₁ × Δwholesale bps (computed as residuals so the sum is exact).</p>
            </div>
          </CardBody>
          <div className="border-t border-border">
            <div className="px-4 pt-3 text-xs font-semibold">Where the wholesale change comes from — by acquirer × card region</div>
            <div className="overflow-x-auto px-1 pb-2"><table className="w-full text-xs">
              <thead><tr><th className="th">Acquirer</th><th className="th">Region</th><th className="th text-right">GPV {monthLabel(aMonth)}</th><th className="th text-right">Wholesale bps {monthLabel(aMonth)}</th><th className="th text-right">GPV {monthLabel(bMonth)}</th><th className="th text-right">Wholesale bps {monthLabel(bMonth)}</th><th className="th text-right">Δ bps</th><th className="th">Fee schedules applied ({monthLabel(bMonth)})</th><th className="th"></th></tr></thead>
              <tbody>{rateCmp.map((x) => (
                <tr key={`${x.acq}${x.region}`} className={x.delta && dec(x.delta).abs().gt(5) ? 'bg-neg/5' : ''}>
                  <td className="td">{x.acq}</td><td className="td">{x.region}</td><td className="td num text-right">{fmtMoney(x.a?.gpv ?? null, 'MUR', { compact: true })}</td><td className="td num text-right">{fmtBps(x.a?.wholesale_bps ?? null, 2)}</td>
                  <td className="td num text-right">{fmtMoney(x.b?.gpv ?? null, 'MUR', { compact: true })}</td><td className="td num text-right">{fmtBps(x.b?.wholesale_bps ?? null, 2)}</td>
                  <td className={`td num text-right ${x.delta && dec(x.delta).gt(0) ? 'text-neg' : ''}`}>{x.delta ? `${dec(x.delta).gt(0) ? '+' : ''}${x.delta}` : '—'}</td>
                  <td className="td max-w-[340px] truncate" title={x.b?.fee_refs ?? ''}>{x.b?.fee_refs ?? '—'}</td>
                  <td className="td"><Link className="link" href={`/merchants/${id}/transactions?range=m:${bMonth.slice(0, 7)}&acquirer=${x.acq}&region=${x.region}`}>txns →</Link></td>
                </tr>))}</tbody>
            </table></div>
          </div>
        </Card>
      </Section>

      <Section title="Pricing simulation">
        <Card id="simulate">
          <CardHeader title="Simulate a pricing change" subtitle={`Base = trailing 3-month monthly average (${last3.map((x: any) => monthLabel(x.month)).join(', ')}), engine PRICING simulatePricing.`} />
          <CardBody>
            <Callout tone="info" title="Units: basis points, not percent">1 bp = 0.01 percentage point. −20 bps = −0.20 pp (e.g. {ex}), <b>not</b> −20 %. Volume growth, migration share and churn probability are entered in percent.</Callout>
            {errors.length > 0 && <div className="mt-3"><Callout tone="neg" title="Invalid input — treated as 0">{errors.join(' · ')}</Callout></div>}
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold">Standard ladder (MDR change only)</div>
                <table className="w-full text-xs">
                  <thead><tr><th className="th">MDR change</th><th className="th text-right">New eff. MDR</th><th className="th text-right">Net revenue</th><th className="th text-right">Δ net revenue</th><th className="th text-right">Contribution</th><th className="th text-right">Δ contribution</th><th className="th text-right">Volume to offset</th></tr></thead>
                  <tbody>{ladder.map((l) => { const v = breakEvenVolumeForPriceChange(base, l.changeBps); return (
                    <tr key={l.changeBps}><td className="td"><Link className="link" href={`/merchants/${id}?range=${r}&mdr=${l.changeBps}#simulate`}>{l.changeBps} bps ({(l.changeBps / 100).toFixed(2)} pp)</Link></td><td className="td num text-right">{fmtBps(l.result.effectiveMdrBps?.toString() ?? null, 2)}</td>
                      <td className="td num text-right">{fmtMoney(l.result.netRevenue.toString())}</td><td className="td num text-right text-neg">{fmtMoney(l.deltaRevenue.toString())}</td><td className="td num text-right">{fmtMoney(l.result.contribution.toString())}</td><td className="td num text-right text-neg">{fmtMoney(l.deltaContribution.toString())}</td><td className="td num text-right">{v ? `+${fmtPct(v.toString())}` : 'not recoverable'}</td></tr>); })}</tbody>
                </table>
                <p className="mt-1 text-2xs text-muted">Volume to offset = GPV growth needed to keep contribution unchanged after the cut (breakEvenVolumeForPriceChange).</p>
                <form method="get" action={`/merchants/${id}#simulate`} className="no-print mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <KeepParams sp={sp} except={['mdr', 'wh', 'growth', 'migShare', 'migDelta', 'churn']} />
                  <div><label className="label" htmlFor="mdr">MDR change (bps)</label><input id="mdr" name="mdr" className="input" inputMode="decimal" defaultValue={spGet(sp, 'mdr') ?? ''} placeholder="e.g. -20 or 25" /></div>
                  <div><label className="label" htmlFor="wh">Wholesale change (bps)</label><input id="wh" name="wh" className="input" inputMode="decimal" defaultValue={spGet(sp, 'wh') ?? ''} placeholder="e.g. 35" /></div>
                  <div><label className="label" htmlFor="growth">Volume growth (%)</label><input id="growth" name="growth" className="input" inputMode="decimal" defaultValue={spGet(sp, 'growth') ?? ''} placeholder="e.g. 5" /></div>
                  <div><label className="label" htmlFor="migShare">Acquirer migration share (% of GPV)</label><input id="migShare" name="migShare" className="input" inputMode="decimal" defaultValue={spGet(sp, 'migShare') ?? ''} placeholder="e.g. 60" /></div>
                  <div><label className="label" htmlFor="migDelta">Wholesale delta on migrated volume (bps)</label><input id="migDelta" name="migDelta" className="input" inputMode="decimal" defaultValue={spGet(sp, 'migDelta') ?? ''} placeholder="target − current, e.g. -35" /></div>
                  <div><label className="label" htmlFor="churn">Churn probability (%)</label><input id="churn" name="churn" className="input" inputMode="decimal" defaultValue={spGet(sp, 'churn') ?? ''} placeholder="e.g. 10" /></div>
                  <div className="col-span-2 flex items-center gap-2 md:col-span-3"><button className="btn-primary" type="submit">Simulate</button><Link className="btn" href={`/merchants/${id}?range=${r}#simulate`}>Reset</Link></div>
                </form>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold">Custom scenario — monthly result</div>
                <table className="w-full text-xs">
                  <thead><tr><th className="th">Measure</th><th className="th text-right">Base (3-m avg)</th><th className="th text-right">Simulated</th><th className="th text-right">Δ</th></tr></thead>
                  <tbody>{simRows.map((x) => { const delta = x.b && x.s ? x.s.minus(x.b) : null; return (
                    <tr key={x.label} className={x.label.startsWith('Contribution') || x.label.startsWith('MIPS') ? 'font-semibold' : ''}><td className="td">{x.label}</td><td className="td num text-right">{fv(x.b, x.kind)}</td><td className="td num text-right">{fv(x.s, x.kind)}</td><td className={`td num text-right ${delta && delta.lt(0) ? 'text-neg' : delta && delta.gt(0) ? 'text-pos' : ''}`}>{sign(delta, x.kind)}</td></tr>); })}</tbody>
                </table>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded border border-border p-2"><div className="text-muted">Volume growth to offset the MDR change</div><div className="num text-sm font-semibold">{inMdr && !inMdr.isZero() ? (beVol ? `${beVol.gte(0) ? '+' : ''}${fmtPct(beVol.toString())}` : 'not recoverable (unit margin ≤ 0)') : '—'}</div></div>
                  <div className="rounded border border-border p-2"><div className="text-muted">Annualised Δ contribution</div><div className="num text-sm font-semibold">{fmtMoney(sim.contribution.minus(b0.contribution).times(12).toString())}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link className="btn-gold" href={decisionHref}>Create scenario in CEO Decision Center</Link>
                  {constraint && <Badge tone="warn">contractually constrained — for preparation only</Badge>}
                </div>
                <p className="mt-2 text-2xs text-muted">The scenario link passes engine units: bps for rate changes; fractions for volume growth, migration share and churn probability (e.g. 10 % → 0.1). Churn is applied as an expected-value weighting.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Contracts applied in the period" actions={<Link className="link text-xs" href={`/merchants/${id}/contracts?range=${r}`}>Manage pricing agreements →</Link>}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title="Acquirer fee schedules actually applied" subtitle={`Wholesale cost to MIPS — from transactions.fee_schedule_id, ${period.label}`} />
            <DataTable rows={fees} filename={`${m.code}-fee-schedules-${period.key}`} dense searchable={false} columns={[{ key: 'schedule_ref', label: 'Schedule', href: `/merchants/${id}/transactions?range=${r}&fs={id}` }, { key: 'acquirer', label: 'Acquirer' }, { key: 'method', label: 'Method' }, { key: 'card_region', label: 'Region' }, { key: 'wholesale_bps', label: 'bps', kind: 'bps', dp: 2 }, { key: 'effective_from', label: 'From', kind: 'date' }, { key: 'effective_to', label: 'To', kind: 'date' }, { key: 'txns', label: 'Txns', kind: 'number' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' }]} /></Card>
          <Card><CardHeader title="Merchant pricing agreements" subtitle="MDR charged by MIPS (effective-dated). Historical transactions keep the agreement they were priced with." />
            <DataTable rows={agreements} filename={`${m.code}-pricing-agreements`} dense searchable={false} columns={[{ key: 'contract_ref', label: 'Contract', href: `/merchants/${id}/transactions?range=${r}&pa={id}` }, { key: 'method', label: 'Method' }, { key: 'card_region', label: 'Region' }, { key: 'mdr_bps', label: 'MDR bps', kind: 'bps', dp: 2 }, { key: 'monthly_saas_fee', label: 'SaaS / month', kind: 'money' }, { key: 'effective_from', label: 'From', kind: 'date' }, { key: 'effective_to', label: 'To', kind: 'date' }]} /></Card>
        </div>
      </Section>
    </div>
  );
}
