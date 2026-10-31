import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { glAccountMonthly, approvedBudgetMonthly, varianceCommentary, engineMonthly, costsByDepartment, costsByProductGl, directCostsByProduct, sumBase, plStatement, variance, isMaterial, covered, detectAnomalies, operatingLeverage, lastActualMonth, comparisonRange, materialityPct, catLabel, COST_LINES, PL_LABEL, s, type AccountMonth, seq } from '@/lib/services/finance';
import { PageHeader, Callout, Section, EmptyState } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendChart, HBarChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { FinanceNav, Provenance, Stat, VarAmt, Amt } from '../financial-performance/_components/finance-ui';
import { addCostCommentaryAction } from './actions';
import { trailingMonths } from '@/lib/period';
import { addMonths, monthEnd, monthStart, monthsInRange } from '@/lib/dates';
import { fmtMoney, fmtPct, fmtNumber, monthLabel } from '@/lib/format';
import { dec, safeDiv, sum, pctChange, ZERO, type Dec } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function CostsPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'finance.view');
  const compare = spGet(sp, 'compare') === 'yoy' ? 'yoy' : 'prior';
  const mat = materialityPct(auth.settings);
  const canManage = auth.permissions.has('finance.manage');
  const data = await tx(auth, async (t) => {
    const last = (await lastActualMonth(t, period.end)) ?? monthStart(period.end);
    const end = monthEnd(last) < period.end && monthEnd(last) >= period.start ? monthEnd(last) : period.end;
    const cmp = comparisonRange(period.start, end, compare);
    const trail = trailingMonths(last, 12);
    const histStart = addMonths(trail[0], -6);
    const [cur, prev, hist, bud, eng, engCmp, dept, prodGl, prodDirect] = await seq(() => glAccountMonthly(t, period.start, end), () => glAccountMonthly(t, cmp.start, cmp.end), () => glAccountMonthly(t, histStart, monthEnd(last)), () => approvedBudgetMonthly(t, period.start, end, auth.fyStartMonth), () => engineMonthly(t, period.start, end), () => engineMonthly(t, cmp.start, cmp.end), () => costsByDepartment(t, period.start, end), () => costsByProductGl(t, period.start, end), () => directCostsByProduct(t, period.start, end));
    const comments = await varianceCommentary(t, { versionIds: bud.versions.map((v) => v.id), start: period.start, end });
    return { last, end, cmp, trail, histStart, cur, prev, hist, bud, eng, engCmp, dept, prodGl, prodDirect, comments };
  });
  const { last, end, cmp, trail, histStart, cur, prev, hist, bud, eng, engCmp, dept, prodGl, prodDirect, comments } = data;
  const ccy = auth.baseCurrency;
  const isCost = (r: { pl_line: string }) => (COST_LINES as string[]).includes(r.pl_line);
  const curC = cur.filter(isCost), prevC = prev.filter(isCost), budC = bud.rows.filter((r) => (COST_LINES as string[]).includes(r.pl_line));
  const opCost = (rows: AccountMonth[]) => sum(rows.filter((r) => r.pl_line !== 'finance_costs').map((r) => r.amount));
  const plA = plStatement(sumBase(cur)), plB = plStatement(sumBase(prev));
  const totalA = sum(curC.map((r) => r.amount)), totalB = sum(prevC.map((r) => r.amount));
  const opA = opCost(curC), opB = opCost(prevC);
  const succA = sum(eng.map((e) => e.successes)), succB = sum(engCmp.map((e) => e.successes));
  const cptA = safeDiv(opA, succA), cptB = safeDiv(opB, succB);
  const ctiA = plA.revenue ? safeDiv(opA, plA.revenue) : null, ctiB = plB.revenue ? safeDiv(opB, plB.revenue) : null;
  const lev = operatingLeverage(plA.revenue ? s(plA.revenue) : null, prev.length ? s(plB.revenue) : null, s(plA.operating_profit), prev.length ? s(plB.operating_profit) : null);

  // ---- by category
  const cats = Array.from(new Set([...curC, ...prevC, ...budC].map((r) => r.cost_category ?? '(uncategorised)')));
  const budMonths = new Set(bud.rows.map((r) => r.period));
  const versionForMonth = new Map(bud.rows.map((r) => [r.period, r.version_id]));
  const periodMonths = monthsInRange(period.start, end);
  const catRows = cats.map((c) => {
    const pick = <T extends { cost_category: string | null; amount: string }>(rows: T[]) => rows.filter((r) => (r.cost_category ?? '(uncategorised)') === c);
    const a = sum(pick(curC).map((r) => r.amount)), p = sum(pick(prevC).map((r) => r.amount));
    const bRows = pick(budC); const b = bRows.length ? sum(bRows.map((r) => r.amount)) : null;
    const v = variance(a, b, false);
    const accts = Array.from(new Set(pick(curC).map((r) => r.code).concat(bRows.map((r) => r.code)))).sort();
    const behaviour = Array.from(new Set(pick(curC).map((r) => r.cost_behaviour ?? 'n/a'))).join('/');
    const lines = Array.from(new Set(pick(curC).map((r) => r.pl_line)));
    const material = isMaterial(a, b, mat);
    const keys = [`cat:${c}`, ...accts, ...lines];
    const commented = periodMonths.some((m) => versionForMonth.has(m) && covered(comments, versionForMonth.get(m)!, m, keys));
    return { category: c, label: catLabel(c), accounts: accts.join(', '), behaviour, line: lines.map((l) => PL_LABEL[l]).join(', '), actual: a.toString(), prior: p.toString(), deltaPct: s(pctChange(a, p), 6), share: s(safeDiv(a, totalA), 6), budget: b ? b.toString() : null, varAbs: s(v.abs), varPct: s(v.pct, 6), favourable: v.favourable, material, commented, flag: material ? (commented ? 'commented' : 'uncommented') : '' };
  }).sort((x, y) => dec(y.actual).cmp(dec(x.actual)));
  const uncommented = catRows.filter((r) => r.material && !r.commented);

  // ---- behaviour split
  const beh = (rows: AccountMonth[]) => { const m = new Map<string, Dec>(); for (const r of rows) { const k = r.pl_line === 'cost_of_sales' ? 'variable' : r.cost_behaviour ?? 'n/a'; m.set(k, (m.get(k) ?? ZERO).plus(dec(r.amount))); } return m; };
  const behA = beh(curC), behB = beh(prevC);

  // ---- trend + anomalies
  const histC = hist.filter(isCost);
  const allMonths = monthsInRange(histStart, monthEnd(last));
  const catSeries = new Map<string, Map<string, Dec>>();
  for (const r of histC) { const c = r.cost_category ?? '(uncategorised)'; if (!catSeries.has(c)) catSeries.set(c, new Map()); const mm = catSeries.get(c)!; mm.set(r.period, (mm.get(r.period) ?? ZERO).plus(dec(r.amount))); }
  const anomalies = [...catSeries.entries()].flatMap(([c, mm]) => detectAnomalies(allMonths.map((m) => ({ period: m, value: mm.get(m) ?? ZERO })), { window: 6, threshold: 2, minHistory: 4, minDeviationPct: mat })
    .filter((p) => p.anomaly && trail.includes(p.period)).map((p) => ({ category: c, ...p }))).sort((a, b) => b.period.localeCompare(a.period));
  const topCats = catRows.slice(0, 6).map((r) => r.category);
  const trend = trail.map((m) => {
    const o: Record<string, string | null> = { month: monthLabel(m) };
    let other = ZERO, fixed = ZERO, variable = ZERO, semi = ZERO;
    for (const [c, mm] of catSeries) { const v = mm.get(m) ?? ZERO; if (topCats.includes(c)) o[c] = v.toString(); else other = other.plus(v); }
    for (const r of histC.filter((x) => x.period === m)) { const k = r.pl_line === 'cost_of_sales' ? 'variable' : r.cost_behaviour; if (k === 'fixed') fixed = fixed.plus(dec(r.amount)); else if (k === 'variable') variable = variable.plus(dec(r.amount)); else semi = semi.plus(dec(r.amount)); }
    o.other = other.toString(); o.fixed = fixed.toString(); o.variable = variable.toString(); o.semi = semi.toString();
    return o;
  });

  // ---- department & product
  const deptMap = new Map<string, { key: string; name: string; amount: Dec; cats: Set<string> }>();
  for (const r of dept) { const e = deptMap.get(r.key) ?? { key: r.key, name: r.name, amount: ZERO, cats: new Set<string>() }; e.amount = e.amount.plus(dec(r.amount)); e.cats.add(catLabel(r.category)); deptMap.set(r.key, e); }
  const deptRows = [...deptMap.values()].map((d) => ({ key: d.key, name: d.name, amount: d.amount.toString(), share: s(safeDiv(d.amount, totalA), 6), categories: [...d.cats].join(', ') })).sort((a, b) => dec(b.amount).cmp(dec(a.amount)));
  const prodRows = prodDirect.map((p) => ({ ...p, total: dec(p.wholesale).plus(p.processing).toString(), perTxn: s(safeDiv(dec(p.wholesale).plus(p.processing), p.successes), 4), gl: prodGl.find((g) => g.key === p.key)?.amount ?? null }));
  const back = `/costs?${new URLSearchParams({ range: period.key, compare }).toString()}`;
  const ok = spGet(sp, 'ok'), err = spGet(sp, 'error');

  return (
    <div>
      <PageHeader eyebrow="Finance" title={`Operating cost intelligence — ${period.label}`}
        subtitle={<>Costs from GL expense accounts (cost of sales, operating expenses, D&A, finance costs) by chart-of-accounts <code>cost_category</code> and <code>cost_behaviour</code>, against {compare === 'yoy' ? 'the same period last year' : 'the prior period'} ({cmp.start} → {cmp.end}) and the approved budget.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} />} />
      <FinanceNav current="/costs" range={period.key} />

      <div className="grid gap-3 lg:grid-cols-2">
        {ok && <Callout tone="pos" title={ok} />}
        {err && <Callout tone="neg" title="Not saved">{err}</Callout>}
        {uncommented.length > 0 && <Callout tone="warn" title={`${uncommented.length} material budget variance(s) without commentary`}>{uncommented.map((u) => <div key={u.category}>{u.label}: <VarAmt v={u.varAbs} favourable={u.favourable} /> ({fmtPct(u.varPct)})</div>)}{canManage ? <a className="link" href="#commentary">Add commentary ↓</a> : <span className="text-muted">Commentary requires finance.manage.</span>}</Callout>}
        {anomalies.length > 0 && <Callout tone="info" title={`${anomalies.length} cost anomal${anomalies.length > 1 ? 'ies' : 'y'} in the last 12 months`}>See the anomaly list below — z-score vs the trailing 6-month mean.</Callout>}
        {end < period.end && <Callout tone="info" title={`Actuals available to ${end}`}>Later months of the selected range have no postings; comparisons use booked months only.</Callout>}
      </div>

      <Section title="Cost KPIs">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Total costs (incl. finance)" value={fmtMoney(totalA.toString(), ccy, { compact: true })} sub={<>{fmtPct(s(pctChange(totalA, totalB), 6))} vs comparison</>} />
          <Stat label="Operating costs (COS + opex + D&A)" value={fmtMoney(opA.toString(), ccy, { compact: true })} sub={<>{fmtPct(s(pctChange(opA, opB), 6))} vs comparison</>} />
          <Stat label="Cost per successful transaction" value={fmtMoney(s(cptA), ccy, { dp: 2 })} sub={<>was {fmtMoney(s(cptB), ccy, { dp: 2 })} · {fmtNumber(succA.toString())} txns</>} />
          <Stat label="Cost-to-income ratio" value={fmtPct(s(ctiA, 6))} sub={<>was {fmtPct(s(ctiB, 6))} · operating costs / GL revenue</>} tone={ctiA && ctiB && ctiA.gt(ctiB) ? 'neg' : 'pos'} />
          <Stat label="Operating leverage" value={lev.value ? `${lev.value.toDecimalPlaces(2).toFixed(2)}×` : '—'} sub={lev.value ? <>%Δ op. profit {fmtPct(s(lev.opChange, 6))} / %Δ revenue {fmtPct(s(lev.revenueChange, 6))}</> : lev.note} />
          <Stat label="Fixed share of costs" value={fmtPct(s(safeDiv(behA.get('fixed') ?? ZERO, totalA), 6))} sub={<>variable {fmtPct(s(safeDiv(behA.get('variable') ?? ZERO, totalA), 6))} · semi {fmtPct(s(safeDiv(behA.get('semi') ?? ZERO, totalA), 6))}</>} />
        </div>
        <p className="mt-2 text-2xs text-muted">Cost per transaction uses operating costs (excl. finance costs) over successful transactions from the transaction engine; registered unit-cost KPI for direct costs: <Link className="link" href={`/proof/kpi/PAY.COST_PER_TXN?range=${encodeURIComponent(period.key)}`}>PAY.COST_PER_TXN</Link>. Operating profit KPI: <Link className="link" href={`/proof/kpi/FIN.OPERATING_PROFIT?range=${encodeURIComponent(period.key)}`}>FIN.OPERATING_PROFIT</Link>.</p>
      </Section>

      <Card className="mt-6">
        <CardHeader title="Costs by category vs comparison and budget" subtitle={<>Budget: {bud.versions.map((v, i) => <span key={v.id}>{i ? ', ' : ''}<Link className="link" href={`/budget/${v.id}`}>{v.name}</Link></span>)}{bud.versions.length ? '' : 'no approved budget'} ({periodMonths.filter((m) => budMonths.has(m)).length}/{periodMonths.length} months) · positive variance = overspend (adverse) · material ≥ {mat.toString()}%</>} />
        <DataTable rows={catRows} filename={`costs-by-category-${period.key.replace(/[:.]/g, '_')}`} pageSize={20} dense rowHref={`/pnl/entries?category={category}&range=${encodeURIComponent(period.key)}`} columns={[
          { key: 'label', label: 'Category' }, { key: 'accounts', label: 'Accounts' }, { key: 'behaviour', label: 'Behaviour' },
          { key: 'actual', label: 'Actual', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct' }, { key: 'prior', label: 'Comparison', kind: 'money' }, { key: 'deltaPct', label: 'Δ %', kind: 'pct' },
          { key: 'budget', label: 'Budget', kind: 'money' }, { key: 'varAbs', label: 'Var (A−B)', kind: 'money' }, { key: 'varPct', label: 'Var %', kind: 'pct' }, { key: 'flag', label: 'Material', kind: 'badge' },
        ]} footer={{ label: 'Total', actual: totalA.toString(), prior: totalB.toString(), budget: budC.length ? sum(budC.map((r) => r.amount)).toString() : null }} />
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Cost trend by category — 12 months" subtitle="Top six categories in the period; remainder grouped" />
          <CardBody><TrendChart data={trend} x="month" height={260} series={[...topCats.map((c) => ({ key: c, label: catLabel(c), type: 'bar' as const, stack: 'c' })), { key: 'other', label: 'Other', type: 'bar' as const, stack: 'c', color: '#94a3b8' }]} /></CardBody></Card>
        <Card><CardHeader title="Fixed vs variable — 12 months" subtitle="chart_of_accounts.cost_behaviour (cost of sales treated as variable)" />
          <CardBody><TrendChart data={trend} x="month" height={260} series={[{ key: 'fixed', label: 'Fixed', type: 'bar', stack: 'b', color: '#173166' }, { key: 'semi', label: 'Semi-variable', type: 'bar', stack: 'b', color: '#b8923d' }, { key: 'variable', label: 'Variable', type: 'bar', stack: 'b', color: '#168052' }]} />
            <table className="mt-3 w-full text-sm"><thead><tr><th className="th">Behaviour</th><th className="th text-right">Current</th><th className="th text-right">Comparison</th><th className="th text-right">Δ %</th></tr></thead><tbody>
              {['fixed', 'semi', 'variable'].map((k) => <tr key={k}><td className="td capitalize">{k}</td><td className="td text-right"><Amt v={s(behA.get(k) ?? ZERO)} /></td><td className="td text-right"><Amt v={s(behB.get(k) ?? ZERO)} /></td><td className="td text-right num">{fmtPct(s(pctChange(behA.get(k) ?? ZERO, behB.get(k) ?? ZERO), 6))}</td></tr>)}
            </tbody></table></CardBody></Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Anomaly detection — ${anomalies.length} flagged`} subtitle={`Per category: monthly cost vs mean of the trailing 6 months; flagged when |z| > 2σ (sample σ, ≥ 4 months history; flat history flags > 5 % deviations); deviations below the ${mat.toString()} % materiality threshold are ignored`} />
        {anomalies.length === 0 ? <CardBody><EmptyState title="No anomalies">No category deviated more than 2σ from its trailing 6-month mean in {monthLabel(trail[0])} – {monthLabel(trail[trail.length - 1])}.</EmptyState></CardBody> : (
          <CardBody><ul className="space-y-2 text-sm">
            {anomalies.map((a) => (
              <li key={`${a.category}-${a.period}`} className="flex flex-wrap items-start gap-2 border-b border-border pb-2">
                <Badge tone={a.direction === 'above' ? 'neg' : 'info'}>{a.direction === 'above' ? 'spike' : 'drop'}</Badge>
                <span><b>{catLabel(a.category)}</b> was <b className="num">{fmtMoney(a.value.toString(), ccy)}</b> in {monthLabel(a.period)} — {a.reason} of {fmtMoney(s(a.mean), ccy)} (σ {fmtMoney(s(a.std), ccy)}{a.z ? `, z = ${a.z.toDecimalPlaces(2).toFixed(2)}` : ''}). Deviation {fmtMoney(s(a.mean ? a.value.minus(a.mean) : null), ccy)}.{' '}
                  <Link className="link" href={`/pnl/entries?category=${encodeURIComponent(a.category)}&range=m:${a.period.slice(0, 7)}`}>Journal lines →</Link></span>
              </li>
            ))}
          </ul></CardBody>
        )}
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Costs by department" subtitle="gl_entries.department_id on expense accounts; untagged company-level costs shown separately" />
          <CardBody className="border-b border-border"><HBarChart data={deptRows.map((d) => ({ label: d.name, v: d.amount }))} labelKey="label" valueKey="v" /></CardBody>
          <DataTable rows={deptRows} filename="costs-by-department" dense searchable={false} rowHref={`/pnl?dept={key}&range=${encodeURIComponent(period.key)}`} columns={[{ key: 'name', label: 'Department' }, { key: 'amount', label: 'Cost', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct' }, { key: 'categories', label: 'Categories' }]} /></Card>
        <Card><CardHeader title="Costs by product" subtitle="Direct transaction costs from the fee engine (wholesale + processing); GL expense lines tagged with a product where available" />
          {prodGl.length === 0 && <CardBody className="pb-0"><p className="text-xs text-warn">No GL expense entries carry a product_id in this period — overheads are not allocated to products in the ledger. Product-level costs below are direct transaction costs only; see <Link className="link" href={`/products?range=${encodeURIComponent(period.key)}`}>Product profitability</Link> for allocated overheads.</p></CardBody>}
          <DataTable rows={prodRows} filename="costs-by-product" dense searchable={false} columns={[{ key: 'name', label: 'Product' }, { key: 'successes', label: 'Txns', kind: 'number' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' }, { key: 'processing', label: 'Processing', kind: 'money' }, { key: 'total', label: 'Direct cost', kind: 'money' }, { key: 'perTxn', label: 'Per txn', kind: 'money', dp: 2 }, { key: 'gl', label: 'GL tagged cost', kind: 'money' }]} /></Card>
      </div>

      <Card className="mt-6" id="commentary">
        <CardHeader title="Budget variance commentary" subtitle={`Commentary stored in variance_commentary against the approved budget version (key cat:<category>, account code or P&L line). ${comments.length} comment(s) in range.`} />
        <CardBody>
          {comments.length === 0 ? <p className="text-sm text-muted">No commentary recorded for this range.</p> : (
            <ul className="space-y-2 text-sm">{comments.map((c) => <li key={c.id} className="border-b border-border pb-2"><Badge>{c.period.slice(0, 7)}</Badge> <Badge tone="navy">{c.line_key}</Badge> <span>{c.comment}</span> <span className="text-2xs text-muted">— {c.author ?? 'system'}, {c.created_at.slice(0, 10)} · {c.version_name}</span></li>)}</ul>
          )}
          {canManage && catRows.length > 0 && (
            <form action={addCostCommentaryAction} className="mt-4 grid gap-2 md:grid-cols-[160px_220px_1fr_auto] md:items-end">
              <input type="hidden" name="back" value={back} />
              <label className="text-xs"><span className="label">Month</span><select name="period" className="input" defaultValue={periodMonths[periodMonths.length - 1]}>{periodMonths.filter((m) => budMonths.has(m)).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
              <label className="text-xs"><span className="label">Category</span><select name="category" className="input" defaultValue={uncommented[0]?.category ?? catRows[0].category}>{catRows.filter((r) => r.category !== '(uncategorised)').map((r) => <option key={r.category} value={r.category}>{r.label}{r.material ? (r.commented ? ' (material, commented)' : ' (material, uncommented)') : ''}</option>)}</select></label>
              <label className="text-xs"><span className="label">Explanation</span><input name="comment" className="input" required minLength={5} maxLength={2000} placeholder="Driver of the variance and expected recurrence" /></label>
              <button className="btn-primary" type="submit">Add commentary</button>
            </form>
          )}
        </CardBody>
      </Card>
      <Provenance>Sources: gl_entries ⨝ chart_of_accounts (pl_line ∈ cost_of_sales, opex, d_and_a, finance_costs; cost_category; cost_behaviour), budget_lines (approved budget per fiscal year), variance_commentary, transactions (successful count, wholesale and processing cost). Cost-to-income = (COS + opex + D&A) / GL revenue. Operating leverage = %Δ operating profit / %Δ revenue vs the comparison period (undefined when revenue is flat or the base is zero).</Provenance>
    </div>
  );
}
