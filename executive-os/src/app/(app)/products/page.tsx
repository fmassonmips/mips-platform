import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { productProfitability, methodCategoryEconomics } from '@/lib/services/merchants';
import { tenantInfo } from '@/lib/services/facts';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { HBarChart } from '@/components/ui/charts';
import { Badge } from '@/components/ui/badge';
import { ALLOC_LABEL, ALLOC_METHODS, parseAlloc, policyLabel, Stat, KeepParams } from '../merchants/shared';
import { fmtMoney, fmtPct } from '@/lib/format';
import { dec } from '@/lib/money';
import type { AllocationMethod } from '@/lib/engine/economics';

export const dynamic = 'force-dynamic';

const INFRA_LABEL: Record<AllocationMethod, string> = { by_transactions: 'By transaction attempts', by_gpv: 'By GPV', by_revenue: 'By recognised revenue', none: 'Not allocated (left in overhead)' };

export default async function ProductProfitabilityPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'merchant.view');
  const tenantDefault = (auth.settings.overhead_allocation as AllocationMethod) || 'by_revenue';
  const alloc = parseAlloc(spGet(sp, 'alloc'), tenantDefault);
  const infra = parseAlloc(spGet(sp, 'infra'), 'by_transactions');
  const d = await tx(auth, async (t) => {
    const [pp, cat, ti] = await Promise.all([productProfitability(t, period.start, period.end, { infraMethod: infra, overheadMethod: alloc }), methodCategoryEconomics(t, period.start, period.end, infra), tenantInfo(t)]);
    return { pp, cat, ti };
  });
  const { pp, cat, ti } = d;
  const T = pp.totals;
  const infraOk = infra === 'none' ? dec(pp.checks.infraAllocated).isZero() : dec(pp.checks.infraAllocated).eq(pp.infraPool);
  const ohOk = alloc === 'none' ? dec(pp.checks.overheadAllocated).isZero() : dec(pp.checks.overheadAllocated).eq(pp.overheadPool);
  const rows = pp.rows.map((r) => ({ ...r, kind: r.transactional ? 'transactional' : 'non-transactional', glDiff: r.transactional ? dec(r.glPosted).minus(dec(r.mdr).minus(r.wholesale)).toString() : null }));
  const range = encodeURIComponent(period.key);
  const catTot = cat.rows.reduce((a, r) => ({ gpv: a.gpv.plus(r.gpv), cm: a.cm.plus(r.contribution), infra: a.infra.plus(r.infra), rev: a.rev.plus(r.recognisedRevenue) }), { gpv: dec(0), cm: dec(0), infra: dec(0), rev: dec(0) });
  const glGap = rows.filter((r) => r.transactional && r.glDiff && dec(r.glDiff).abs().gt(1));

  return (
    <div>
      <PageHeader eyebrow="Payment economics" title={`Product profitability — ${period.label}`}
        subtitle={<>Transactional products from the fee engine (<code>transactions</code>); non-transactional products (orchestration, payouts, reconciliation, SaaS) from GL revenue accounts 4100/4200 tagged with <code>product_id</code>. Revenue policy: <b>{policyLabel(pp.policy, ti.settings?.revenue_policy_note)}</b>.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />

      <form method="get" className="card no-print mb-4 flex flex-wrap items-end gap-3 p-3">
        <KeepParams sp={sp} except={['alloc', 'infra']} />
        <div><label className="label" htmlFor="infra">Infrastructure cost (GL cloud) allocation</label>
          <select id="infra" name="infra" defaultValue={infra} className="input w-auto py-1 text-xs">{ALLOC_METHODS.map((k) => <option key={k} value={k}>{INFRA_LABEL[k]}{k === 'by_transactions' ? ' (default)' : ''}</option>)}</select></div>
        <div><label className="label" htmlFor="alloc">Overhead allocation</label>
          <select id="alloc" name="alloc" defaultValue={alloc} className="input w-auto py-1 text-xs">{ALLOC_METHODS.map((k) => <option key={k} value={k}>{ALLOC_LABEL[k]}{k === tenantDefault ? ' (tenant default)' : ''}</option>)}</select></div>
        <button className="btn-primary py-1 text-xs" type="submit">Apply</button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Recognised revenue" value={fmtMoney(T.recognisedRevenue, 'MUR', { compact: true })} sub={`of which non-transactional ${fmtMoney(T.nonTxnRevenue, 'MUR', { compact: true })}`} />
        <Stat label="Direct processing" value={fmtMoney(T.processing, 'MUR', { compact: true })} sub="fee-engine cost model" />
        <Stat label="Infrastructure (cloud)" value={fmtMoney(pp.infraPool, 'MUR', { compact: true })} sub={INFRA_LABEL[infra]} />
        <Stat label="Contribution" value={fmtMoney(T.contribution, 'MUR', { compact: true })} sub={`${fmtPct(T.contributionPct)} of revenue`} />
        <Stat label="Overhead pool" value={fmtMoney(pp.overheadPool, 'MUR', { compact: true })} sub={ALLOC_LABEL[alloc]} />
        <Stat label="Product profitability" value={fmtMoney(T.profit, 'MUR', { compact: true })} tone={dec(T.profit).lt(0) ? 'neg' : 'pos'} sub={`${fmtPct(T.profitPct)} of revenue`} />
      </div>

      <Section title="Product P&L">
        <Card>
          <DataTable rows={rows} filename={`product-profitability-${period.key}`} pageSize={20} dense footer={{ ...T, name: 'Total (Σ rows)', kind: '', glDiff: null }} columns={[
            { key: 'name', label: 'Product' }, { key: 'kind', label: 'Type' }, { key: 'attempts', label: 'Txn attempts', kind: 'number' }, { key: 'successes', label: 'Successful', kind: 'number' }, { key: 'gpv', label: 'Transaction value (GPV)', kind: 'money' },
            { key: 'mdr', label: 'Gross fees (MDR)', kind: 'money' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' }, { key: 'nonTxnRevenue', label: 'Non-txn revenue (GL)', kind: 'money' },
            { key: 'recognisedRevenue', label: pp.policy === 'principal_gross' ? 'Recognised revenue (gross)' : 'Recognised revenue (net)', kind: 'money' }, { key: 'processing', label: 'Direct processing', kind: 'money' },
            { key: 'infra', label: 'Infrastructure (alloc.)', kind: 'money' }, { key: 'otherDirect', label: 'Other attributable', kind: 'money' }, { key: 'contribution', label: 'Contribution', kind: 'money' }, { key: 'contributionPct', label: 'CM %', kind: 'pct' },
            { key: 'overhead', label: 'Overhead (alloc.)', kind: 'money' }, { key: 'profit', label: 'Product profit', kind: 'money' }, { key: 'profitPct', label: 'Profit %', kind: 'pct' }, { key: 'revenuePerTxn', label: 'Revenue / txn', kind: 'money', dp: 2 },
            { key: 'glPosted', label: 'GL posted 4000', kind: 'money' }, { key: 'glDiff', label: 'GL − fee engine', kind: 'money', dp: 2 },
          ]} />
          <p className="border-t border-border px-4 py-2 text-2xs text-muted">Contribution = MDR − wholesale + non-transactional revenue − direct processing − infrastructure − other attributable costs (identical under both revenue policies). Product profit = contribution − allocated overhead. “GL posted 4000” is the month-end net payment revenue journal by product; the last column shows the difference to the fee engine (reconciliation evidence, not used in the calculation). <Link className="link" href={`/merchants?groupBy=product&range=${range}`}>Merchant view by product →</Link></p>
        </Card>
        {glGap.length > 0 && <div className="mt-3"><Callout tone="warn" title="GL net payment revenue differs from the fee engine">{glGap.map((r) => <div key={r.key}>{r.name}: GL − fee engine = {fmtMoney(r.glDiff, 'MUR', { dp: 2 })}</div>)}<div className="mt-1 text-2xs">Investigate in the Financial Proof Center (missing accrual or posting error). Product contribution above uses the fee engine.</div></Callout></div>}
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Allocation methodology" subtitle="Allocations sum exactly to their pools (rounding residual assigned to the largest unit)." />
          <CardBody className="space-y-3 text-sm">
            <div>
              <div className="flex items-center gap-2 font-semibold">Infrastructure pool {infraOk ? <Badge tone="pos">Σ = pool</Badge> : <Badge tone="neg">mismatch</Badge>}</div>
              <p className="text-muted">GL accounts with cost category <code>cloud</code> in {period.label}: <b className="num text-fg">{fmtMoney(pp.infraPool, 'MUR', { dp: 2 })}</b>. Method: <b>{INFRA_LABEL[infra]}</b>{infra === 'by_transactions' ? ' — every transaction attempt (successful or failed) consumes platform capacity; non-transactional products receive none' : ''}. Allocated: <span className="num">{fmtMoney(pp.checks.infraAllocated, 'MUR', { dp: 2 })}</span>.</p>
            </div>
            <div>
              <div className="flex items-center gap-2 font-semibold">Overhead pool {ohOk ? <Badge tone="pos">Σ = pool</Badge> : <Badge tone="neg">mismatch</Badge>}</div>
              <p className="text-muted">GL opex + D&amp;A <span className="num">{fmtMoney(pp.overheadGross, 'MUR', { dp: 2 })}</span>{infra !== 'none' ? <> minus infrastructure already allocated <span className="num">{fmtMoney(pp.infraPool, 'MUR', { dp: 2 })}</span></> : null} minus opex already tagged to a product = <b className="num text-fg">{fmtMoney(pp.overheadPool, 'MUR', { dp: 2 })}</b>. Method: <b>{ALLOC_LABEL[alloc]}</b>{alloc === 'by_transactions' || alloc === 'by_gpv' ? ' — non-transactional products receive no overhead under a volume driver' : ''}. Allocated: <span className="num">{fmtMoney(pp.checks.overheadAllocated, 'MUR', { dp: 2 })}</span>.</p>
            </div>
            <p className="text-2xs text-muted">Direct processing uses the documented processing-cost model stored on each transaction (processing_cost_rates). “Other attributable” = GL expense lines tagged with the product (excluding cloud).</p>
          </CardBody>
        </Card>
        <Card><CardHeader title="Product profit after overhead" subtitle={`MUR, ${period.label}`} /><CardBody><HBarChart data={rows.map((r) => ({ label: r.name, v: r.profit }))} labelKey="label" valueKey="v" /></CardBody></Card>
      </div>

      <Section title="By payment method category — card payments, QR, digital wallets">
        <Card>
          <DataTable rows={cat.rows} filename={`method-category-economics-${period.key}`} dense searchable={false} footer={{ name: 'Total', gpv: catTot.gpv.toString(), recognisedRevenue: catTot.rev.toString(), infra: catTot.infra.toString(), contribution: catTot.cm.toString() }} columns={[
            { key: 'name', label: 'Category' }, { key: 'methods', label: 'Methods' }, { key: 'attempts', label: 'Attempts', kind: 'number' }, { key: 'successes', label: 'Successful', kind: 'number' }, { key: 'gpv', label: 'GPV', kind: 'money' },
            { key: 'mdr', label: 'MDR', kind: 'money' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' }, { key: 'recognisedRevenue', label: 'Recognised revenue', kind: 'money' }, { key: 'processing', label: 'Direct processing', kind: 'money' },
            { key: 'infra', label: 'Infrastructure (alloc.)', kind: 'money' }, { key: 'contribution', label: 'Contribution', kind: 'money' }, { key: 'contributionPct', label: 'CM %', kind: 'pct' },
            { key: 'effectiveMdrBps', label: 'Eff. MDR bps', kind: 'bps' }, { key: 'takeRateBps', label: 'Take rate bps', kind: 'bps' }, { key: 'revenuePerTxn', label: 'Revenue / txn', kind: 'money', dp: 2 }, { key: 'costPerTxn', label: 'Cost / txn', kind: 'money', dp: 2 },
          ]} />
          <p className="border-t border-border px-4 py-2 text-2xs text-muted">Category from <code>payment_methods.category</code>. The infrastructure pool ({fmtMoney(cat.infraPool)}) is allocated across categories with the same driver ({INFRA_LABEL[cat.infraMethod]}); overhead is not allocated in this view. <Link className="link" href={`/merchants?groupBy=method&range=${range}`}>Drill down by payment method →</Link></p>
        </Card>
      </Section>
    </div>
  );
}
