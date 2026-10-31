import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendChart, HBarChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { todayISO, trailingMonths } from '@/lib/period';
import { monthEnd, addMonths } from '@/lib/dates';
import { fmtMoney, fmtNumber, monthLabel } from '@/lib/format';
import { dec, sum } from '@/lib/money';
import { runway, STANDARD_STRESS_TESTS } from '@/lib/engine/runway';
import { economicsBy } from '@/lib/services/merchants';
import { accountBalances, cashSplit, monthlyOperatingNet, runStressTests, tenantMinimumLiquidity } from '@/lib/services/treasury';
import { Provenance } from '../cash-flow/_components/flash';

export const dynamic = 'force-dynamic';

const CLASS_LABEL: Record<string, string> = { operating: 'Operating (unrestricted)', restricted: 'Restricted', safeguarded: 'Safeguarded merchant funds', merchant_settlement: 'Merchant settlement' };

function num(v: string | undefined, d: string, lo: number, hi: number): string {
  if (!v || !/^-?\d+(\.\d+)?$/.test(v.trim())) return d;
  const x = dec(v.trim()); return x.lt(lo) || x.gt(hi) ? d : x.toString();
}

export default async function LiquidityPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'finance.view');
  const base = auth.baseCurrency;
  const today = todayISO();
  const asOf = period.end < today ? period.end : today;
  const basis = spGet(sp, 'basis') === '6' ? 6 : spGet(sp, 'basis') === '3' ? 3 : 12;
  const inp = {
    lossPct: num(spGet(sp, 'lossPct'), '100', 0, 100), acqShare: num(spGet(sp, 'acqShare'), '30', 0, 100), acqMonths: Number(num(spGet(sp, 'acqMonths'), '1', 1, 12)),
    bps: num(spGet(sp, 'bps'), '15', 0, 500), delay: num(spGet(sp, 'delay'), '30', 0, 365), infra: num(spGet(sp, 'infra'), '25', 0, 500),
    reg: num(spGet(sp, 'reg'), '500000', 0, 1e12), regMonth: Number(num(spGet(sp, 'regMonth'), '3', 1, 12)),
  };
  const trail = trailingMonths(asOf, 12);
  const wStart = trail[0], wEnd = monthEnd(trail[11]) < asOf ? monthEnd(trail[11]) : asOf;
  const data = await tx(auth, async (t) => {
    const bal = await accountBalances(t, asOf, base);
    const hist = await monthlyOperatingNet(t, trail, base);
    const closing = [];
    for (const m of trail) closing.push(cashSplit(await accountBalances(t, monthEnd(m) < asOf ? monthEnd(m) : asOf, base)).operating.toString());
    const regs = await q<{ code: string; description: string; minimum_amount_base: string; basis: string }>(t, 'SELECT code, description, minimum_amount_base::text, basis FROM regulatory_requirements ORDER BY code');
    const econ = await economicsBy(t, wStart, wEnd, 'merchant');
    const credit = await one<{ v: string }>(t, `SELECT coalesce(sum(amount * fx_rate_to_base),0)::text AS v FROM customer_invoices WHERE status <> 'void' AND issue_date BETWEEN $1 AND $2`, [wStart, wEnd]);
    const cloud = await one<{ v: string }>(t, `SELECT coalesce(sum(e.debit_base - e.credit_base),0)::text AS v FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE a.cost_category = 'cloud' AND e.entry_date BETWEEN $1 AND $2`, [wStart, wEnd]);
    return { bal, hist, closing, regs, econ, credit: credit?.v ?? '0', cloud: cloud?.v ?? '0' };
  });

  const split = cashSplit(data.bal);
  const minL = tenantMinimumLiquidity(auth);
  const flows = data.hist.map((h) => h.net);
  const basisFlows = flows.slice(-basis);
  const rw = runway({ unrestrictedCash: split.operating, restrictedCash: split.nonOperating, monthlyNetCashFlows: basisFlows, minimumLiquidity: minL });
  const largest = data.econ.rows[0];
  const monthsInWindow = 12;
  const netPayRev12 = dec(data.econ.totals.mdr).minus(data.econ.totals.wholesale);
  const stress = runStressTests({
    unrestrictedCash: split.operating, baseMonthlyFlow: rw.avgMonthlyNetFlow, minimumLiquidity: minL, months: 12,
    largestMerchantContribution12m: largest?.contribution ?? '0', merchantLossPct: dec(inp.lossPct).div(100),
    monthlyNetPaymentRevenue: netPayRev12.div(monthsInWindow), acquirerSharePct: dec(inp.acqShare).div(100), acquirerMonths: inp.acqMonths,
    trailingGpv12m: data.econ.totals.gpv, compressionBps: inp.bps, creditSales12m: data.credit, delayDays: inp.delay,
    cloudCost12m: data.cloud, infraPct: dec(inp.infra).div(100), regulatoryOneOff: inp.reg, regulatoryMonth: inp.regMonth,
  });
  const projMonths = Array.from({ length: 12 }, (_, i) => addMonths(asOf, i + 1));
  const projChart = projMonths.map((m, i) => ({ month: monthLabel(m), ...Object.fromEntries(stress.map((s) => [s.key, s.projection[i].toString()])) }));
  const histChart = trail.map((m, i) => ({ month: monthLabel(m), net: flows[i], closing: data.closing[i] }));
  const needsVerify = (b: string) => /demo|placeholder|verify|confirm/i.test(b);
  const maxReg = data.regs.reduce((a, r) => (dec(r.minimum_amount_base).gt(a) ? dec(r.minimum_amount_base) : a), dec(0));
  const byClass = ['operating', 'safeguarded', 'merchant_settlement', 'restricted'].map((c) => ({ label: CLASS_LABEL[c], v: sum(data.bal.filter((a) => a.account_class === c).map((a) => a.balance_base ?? '0')).toString() }));
  const labelOf = (k: string) => STANDARD_STRESS_TESTS.find((s) => s.key === k)?.label;

  return (
    <div>
      <PageHeader eyebrow="Treasury" title={`Liquidity & runway — as of ${asOf}`}
        subtitle={<>Unrestricted (operating) cash only. Safeguarded merchant funds, merchant-settlement balances and restricted deposits are reported separately and never counted in runway or liquidity headroom. Net operating cash flow from bank statement lines ({base}).</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Unrestricted cash</div><div className="mt-1 text-lg font-semibold num">{fmtMoney(split.operating.toString(), base)}</div><div className="text-2xs text-muted">operating accounts</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Restricted / merchant funds (excluded)</div><div className="mt-1 text-lg font-semibold num">{fmtMoney(split.nonOperating.toString(), base)}</div><div className="text-2xs text-muted">safeguarded {fmtMoney(split.safeguarded.toString(), base, { compact: true })} · settlement {fmtMoney(split.merchantSettlement.toString(), base, { compact: true })} · restricted {fmtMoney(split.restricted.toString(), base, { compact: true })}</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Average net operating cash flow ({basis} mo)</div><div className={`mt-1 text-lg font-semibold num ${rw.avgMonthlyNetFlow.lt(0) ? 'text-neg' : 'text-pos'}`}>{fmtMoney(rw.avgMonthlyNetFlow.toString(), base)}</div><div className="text-2xs text-muted">per month</div></CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Runway</div>
          {rw.status === 'cash_generative' ? <><div className="mt-1 text-base font-semibold text-pos">Cash-generative — no finite runway</div><div className="text-2xs text-muted">Average net flow ≥ 0; see scenario projections below</div></>
            : <><div className="mt-1 text-lg font-semibold num text-neg">{rw.runwayMonths ? `${fmtNumber(rw.runwayMonths.toString(), 1)} months` : '—'}</div><div className="text-2xs text-muted">burn {fmtMoney(rw.monthlyBurn?.toString(), base)} / mo · to minimum: {rw.runwayToMinimumMonths ? `${fmtNumber(rw.runwayToMinimumMonths.toString(), 1)} mo` : '—'}</div></>}
        </CardBody></Card>
        <Card><CardBody className="p-3"><div className="text-2xs text-muted">Headroom over minimum liquidity</div><div className={`mt-1 text-lg font-semibold num ${rw.headroom.lt(0) ? 'text-neg' : ''}`}>{fmtMoney(rw.headroom.toString(), base)}</div><div className="text-2xs text-muted">minimum {fmtMoney(minL, base)} (settings.minimum_liquidity)</div></CardBody></Card>
      </div>
      {rw.status === 'below_minimum' && <div className="mt-3"><Callout tone="neg" title="Unrestricted cash is below the minimum liquidity threshold">Shortfall {fmtMoney(rw.headroom.neg().toString(), base)}.</Callout></div>}
      {split.missingFx.length > 0 && <div className="mt-3"><Callout tone="warn" title="Missing FX rate">Excluded: {split.missingFx.join(', ')}</Callout></div>}
      <Provenance>engine runway.runway (status {rw.status}); restricted cash input = all non-operating classes. Basis for the average: <Link className={`link ${basis === 3 ? 'font-semibold' : ''}`} href={`/liquidity?${new URLSearchParams({ ...(sp as Record<string, string>), basis: '3' })}`}>3</Link> / <Link className={`link ${basis === 6 ? 'font-semibold' : ''}`} href={`/liquidity?${new URLSearchParams({ ...(sp as Record<string, string>), basis: '6' })}`}>6</Link> / <Link className={`link ${basis === 12 ? 'font-semibold' : ''}`} href={`/liquidity?${new URLSearchParams({ ...(sp as Record<string, string>), basis: '12' })}`}>12</Link> months. Executive KPI: <Link className="link" href={`/proof/kpi/FIN.CASH_BALANCE?range=${encodeURIComponent(period.key)}`}>FIN.CASH_BALANCE</Link>.</Provenance>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Cash by account class" subtitle={`${asOf}, ${base}`} />
          <CardBody>
            <HBarChart data={byClass} labelKey="label" valueKey="v" height={170} />
            <table className="mt-2 w-full text-xs"><tbody>{data.bal.map((a) => <tr key={a.code}><td className="td"><Link className="link" href={`/cash-flow/transactions?account=${a.code}&month=${asOf.slice(0, 7)}`}>{a.code}</Link></td><td className="td"><Badge tone={a.account_class === 'operating' ? 'pos' : 'navy'}>{a.account_class.replace('_', ' ')}</Badge></td><td className="td num text-right">{fmtMoney(a.balance_base, '')}</td></tr>)}</tbody></table>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Net operating cash flow and closing unrestricted cash — 12 months" subtitle="Bank data, operating accounts only" actions={<Link className="link text-xs" href="/cash-flow">Cash flow detail →</Link>} />
          <CardBody><TrendChart data={histChart} x="month" refLine={Number(minL)} series={[{ key: 'net', label: 'Net operating cash flow', type: 'bar' }, { key: 'closing', label: 'Closing unrestricted cash (right)', type: 'line', yAxis: 'right', color: '#b8923d' }]} /></CardBody>
        </Card>
      </div>

      <Section title="Minimum liquidity & regulatory requirements">
        <Card>
          <table className="w-full border-collapse text-sm">
            <thead><tr><th className="th">Code</th><th className="th">Requirement</th><th className="th text-right">Minimum ({base})</th><th className="th">Documented basis</th><th className="th text-right">Unrestricted cash headroom</th></tr></thead>
            <tbody>
              <tr><td className="td">SETTINGS</td><td className="td">Tenant minimum liquidity (used for breach tests)</td><td className="td num text-right">{fmtMoney(minL, '')}</td><td className="td">tenants.settings.minimum_liquidity</td><td className={`td num text-right ${split.operating.minus(minL).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(split.operating.minus(minL).toString(), '')}</td></tr>
              {data.regs.map((r) => <tr key={r.code}><td className="td">{r.code}</td><td className="td">{r.description}</td><td className="td num text-right">{fmtMoney(r.minimum_amount_base, '')}</td><td className="td whitespace-normal">{r.basis} {needsVerify(r.basis) && <Badge tone="warn">needs verification</Badge>}</td><td className={`td num text-right ${split.operating.minus(r.minimum_amount_base).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(split.operating.minus(r.minimum_amount_base).toString(), '')}</td></tr>)}
            </tbody>
          </table>
        </Card>
        <p className="mt-1 text-2xs text-muted">Requirements marked “needs verification” are DEMO placeholders and must be confirmed against the applicable Bank of Mauritius / FSC rules by compliance before any reliance. Not all requirements are cash floors (e.g. minimum capital is an equity measure); headroom against unrestricted cash is shown for orientation only. Highest documented amount: {fmtMoney(maxReg.toString(), base)}.</p>
      </Section>

      <Section title="Stress tests — 12-month projected unrestricted cash">
        <Card>
          <CardHeader title="Stress inputs" subtitle="Adjust and apply (GET parameters). Trailing window for drivers: " />
          <CardBody>
            <form method="get" className="grid gap-3 text-xs md:grid-cols-4 xl:grid-cols-9">
              <input type="hidden" name="range" value={period.key} /><input type="hidden" name="basis" value={basis} />
              {([['lossPct', 'Largest merchant contribution lost (%)', inp.lossPct], ['acqShare', 'Acquirer volume unavailable (%)', inp.acqShare], ['acqMonths', 'Disruption months', String(inp.acqMonths)], ['bps', 'Take-rate compression (bps)', inp.bps], ['delay', 'Collection delay (days)', inp.delay], ['infra', 'Infrastructure cost increase (%)', inp.infra], ['reg', `Regulatory one-off (${base}) — assumption`, inp.reg], ['regMonth', 'Regulatory payment month (1–12)', String(inp.regMonth)]] as const).map(([k, l, v]) => (
                <div key={k}><label className="label" htmlFor={k}>{l}</label><input id={k} name={k} className="input" defaultValue={v} inputMode="decimal" /></div>
              ))}
              <div className="flex items-end gap-2"><button className="btn-primary">Apply</button><Link className="btn" href={`/liquidity?range=${encodeURIComponent(period.key)}`}>Reset</Link></div>
            </form>
            <p className="mt-2 text-2xs text-muted">Drivers from {wStart} → {wEnd}: largest merchant <b>{largest?.name ?? '—'}</b> contribution {fmtMoney(largest?.contribution ?? '0', base)}; GPV {fmtMoney(data.econ.totals.gpv, base, { compact: true })}; net payment revenue (MDR − wholesale) {fmtMoney(netPayRev12.toString(), base)}; credit sales (customer invoices) {fmtMoney(data.credit, base)}; GL cloud cost {fmtMoney(data.cloud, base)}. The regulatory one-off default (MUR 500,000) is an input assumption, not a data point — set it to the amount you want to test.</p>
          </CardBody>
        </Card>
        <Card className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className="th">Scenario</th><th className="th text-right">Monthly shock</th><th className="th text-right">One-off</th><th className="th text-right">Month-12 cash</th><th className="th text-right">Lowest cash</th><th className="th">Minimum liquidity breached</th><th className="th">Basis</th></tr></thead>
              <tbody>{stress.map((s) => (
                <tr key={s.key} className={s.key === 'base' ? 'bg-surface-2 font-medium' : ''}>
                  <td className="td whitespace-normal">{s.label}{labelOf(s.key) && s.label !== labelOf(s.key) && <div className="text-2xs text-muted">{labelOf(s.key)}</div>}</td>
                  <td className={`td num text-right ${s.monthlyShock.lt(0) ? 'text-neg' : ''}`}>{s.monthlyShock.isZero() ? '—' : fmtMoney(s.monthlyShock.toString(), '')}</td>
                  <td className={`td num text-right ${s.oneOff.gt(0) ? 'text-neg' : ''}`}>{s.oneOff.isZero() ? '—' : `${fmtMoney(s.oneOff.neg().toString(), '')} (m${s.oneOffMonth})`}</td>
                  <td className="td num text-right">{fmtMoney(s.endCash.toString(), '')}</td>
                  <td className={`td num text-right ${s.minCash.lt(minL) ? 'text-neg font-semibold' : ''}`}>{fmtMoney(s.minCash.toString(), '')}</td>
                  <td className="td">{s.breachMonth === null ? <span className="text-pos">not breached (12 mo)</span> : <span className="font-semibold text-neg">month {s.breachMonth} ({monthLabel(projMonths[s.breachMonth - 1])})</span>}</td>
                  <td className="td whitespace-normal text-2xs text-muted">{s.basis}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
        <Card className="mt-3"><CardHeader title="Scenario projections" subtitle={`engine runway.projectCash from ${fmtMoney(split.operating.toString(), base, { compact: true })} with base flow ${fmtMoney(rw.avgMonthlyNetFlow.toString(), base, { compact: true })}/mo; dashed line = minimum liquidity`} />
          <CardBody><TrendChart data={projChart} x="month" refLine={Number(minL)} height={280} series={stress.map((s, i) => ({ key: s.key, label: s.key.replace(/_/g, ' '), type: 'line' as const, color: ['#173166', '#c43131', '#c27803', '#7c3aed', '#0e7490', '#2563c2', '#64748b'][i] }))} /></CardBody>
        </Card>
        <div className="mt-3">
          <DataTable filename={`liquidity-stress-${asOf}`} searchable={false} rows={projMonths.map((m, i) => ({ month: m.slice(0, 7), ...Object.fromEntries(stress.map((s) => [s.key, s.projection[i].toString()])) }))} columns={[{ key: 'month', label: 'Month' }, ...stress.map((s) => ({ key: s.key, label: s.key.replace(/_/g, ' '), kind: 'money' as const }))]} />
        </div>
        <Provenance>engine runway.STANDARD_STRESS_TESTS / projectCash; merchant contribution from services/merchants.economicsBy (transactions + SaaS); credit sales from customer_invoices; cloud cost from gl_entries (cost_category = cloud). Projections are deterministic what-ifs, not forecasts.</Provenance>
      </Section>
    </div>
  );
}
