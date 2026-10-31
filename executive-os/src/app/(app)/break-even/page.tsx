import { Fragment } from 'react';
import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TrendChart } from '@/components/ui/charts';
import { Badge } from '@/components/ui/badge';
import { Stat, KeepParams } from '../merchants/shared';
import { computeBreakEven, parseBeParams, PARAM_KEYS } from './compute';
import { SnapshotForm } from './snapshot-form';
import { ENGINE } from './engine-version';
import { monthStart } from '@/lib/dates';
import { fmtMoney, fmtPct, fmtBps, fmtNumber, monthLabel } from '@/lib/format';
import { dec, safeDiv, type Dec } from '@/lib/money';
import type { BreakEvenResult } from '@/lib/engine/breakeven';

export const dynamic = 'force-dynamic';

type Kind = 'money' | 'count' | 'bps' | 'pct' | 'ratio';
const ROWS: { label: string; get: (r: BreakEvenResult) => Dec | null; kind: Kind; group: string; strong?: boolean }[] = [
  { group: 'Volume & margin', label: 'GPV (monthly, processed)', get: (r) => r.gpv, kind: 'money' },
  { group: 'Volume & margin', label: 'Successful transactions', get: (r) => r.successes, kind: 'count' },
  { group: 'Volume & margin', label: 'Net revenue (MDR − wholesale + recurring)', get: (r) => r.netRevenue, kind: 'money' },
  { group: 'Volume & margin', label: 'Variable costs (direct processing; wholesale netted)', get: (r) => r.netRevenue.minus(r.contribution), kind: 'money' },
  { group: 'Volume & margin', label: 'Contribution margin', get: (r) => r.contribution, kind: 'money', strong: true },
  { group: 'Volume & margin', label: 'Contribution ratio (of net revenue)', get: (r) => r.contributionRatio, kind: 'pct' },
  { group: 'Volume & margin', label: 'Variable contribution per transaction', get: (r) => r.contributionPerTxn, kind: 'money' },
  { group: 'Volume & margin', label: 'Variable contribution per GPV', get: (r) => r.contributionPerGpvBps, kind: 'bps' },
  { group: 'Accounting break-even', label: 'Fixed costs (opex + D&A)', get: (r) => r.fixedCosts, kind: 'money' },
  { group: 'Accounting break-even', label: 'Operating profit', get: (r) => r.operatingProfit, kind: 'money', strong: true },
  { group: 'Accounting break-even', label: 'Break-even revenue', get: (r) => r.breakEvenRevenue, kind: 'money', strong: true },
  { group: 'Accounting break-even', label: 'Break-even GPV', get: (r) => r.breakEvenGpv, kind: 'money' },
  { group: 'Accounting break-even', label: 'Break-even transaction volume', get: (r) => r.breakEvenTxns, kind: 'count' },
  { group: 'Accounting break-even', label: 'Required take rate at current GPV', get: (r) => r.requiredTakeRateBps, kind: 'bps' },
  { group: 'Accounting break-even', label: 'Required merchant count (at avg GPV / merchant)', get: (r) => r.requiredMerchants, kind: 'count' },
  { group: 'Accounting break-even', label: 'Margin of safety', get: (r) => r.marginOfSafety, kind: 'pct', strong: true },
  { group: 'Operating-cash break-even', label: 'Cash fixed outflows (fixed − D&A + cash-only)', get: (r) => r.cashFixedCosts, kind: 'money' },
  { group: 'Operating-cash break-even', label: 'Operating cash profit', get: (r) => r.operatingCashProfit, kind: 'money', strong: true },
  { group: 'Operating-cash break-even', label: 'Cash break-even revenue', get: (r) => r.cashBreakEvenRevenue, kind: 'money', strong: true },
  { group: 'Operating-cash break-even', label: 'Cash break-even GPV', get: (r) => r.cashBreakEvenGpv, kind: 'money' },
  { group: 'Operating-cash break-even', label: 'Cash margin of safety', get: (r) => (r.cashBreakEvenGpv ? safeDiv(r.gpv.minus(r.cashBreakEvenGpv), r.gpv) : null), kind: 'pct' },
];
const f = (v: Dec | null, k: Kind) => v === null ? '—' : k === 'money' ? fmtMoney(v.toString()) : k === 'count' ? fmtNumber(v.toString()) : k === 'bps' ? fmtBps(v.toString(), 1) : k === 'pct' ? fmtPct(v.toString()) : fmtNumber(v.toString(), 2);
const fd = (v: Dec | null, k: Kind) => v === null ? '—' : k === 'pct' ? `${v.gt(0) ? '+' : ''}${v.times(100).toFixed(1)} pp` : `${v.gt(0) ? '+' : ''}${f(v, k)}`;

export default async function BreakEvenPage({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'merchant.view');
  const endMonth = monthStart(period.end);
  const { p, errors } = parseBeParams((k) => spGet(sp, k));
  const d = await tx(auth, async (t) => {
    const c = await computeBreakEven(t, endMonth, p);
    const snaps = await q<any>(t, `SELECT e.reference, e.subject_id, e.description, e.sha256, e.created_at, u.name AS by FROM evidence_records e LEFT JOIN users u ON u.id = e.created_by WHERE e.subject_type = 'break_even' ORDER BY e.created_at DESC LIMIT 10`);
    return { c, snaps };
  });
  const { c, snaps } = d;
  const B = c.baseRes, S = c.simRes;
  const simulated = PARAM_KEYS.some((k) => k !== 'cash' && k !== 'other' && spGet(sp, k));
  const cur = Object.fromEntries(PARAM_KEYS.map((k) => [k, spGet(sp, k) ?? ''])) as Record<string, string>;
  const deriv = c.base.months.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const groups = Array.from(new Set(ROWS.map((r) => r.group)));
  const beOk = (r: BreakEvenResult) => r.operatingProfit.gte(0);

  return (
    <div>
      <PageHeader eyebrow="Payment economics" title={`Break-even analysis — base ${c.base.months.map((m) => monthLabel(m.month)).join(', ')}`}
        subtitle={<>Monthly averages of the trailing 3 months ending {monthLabel(endMonth)}. Transactions (fee engine) for GPV, MDR, wholesale and processing; SaaS from active pricing agreements; fixed costs = GL opex + D&amp;A; depreciation = GL D&amp;A. Engine: {ENGINE}.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />

      {errors.length > 0 && <div className="mb-3"><Callout tone="neg" title="Invalid input — treated as 0">{errors.join(' · ')}</Callout></div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Fixed costs / month" value={fmtMoney(S.fixedCosts.toString(), 'MUR', { compact: true })} sub={`of which D&A ${fmtMoney(c.input.depreciation as string, 'MUR', { compact: true })}`} />
        <Stat label="Contribution / month" value={fmtMoney(S.contribution.toString(), 'MUR', { compact: true })} sub={`ratio ${fmtPct(S.contributionRatio?.toString() ?? null)}`} />
        <Stat label="Break-even revenue (accounting)" value={fmtMoney(S.breakEvenRevenue?.toString() ?? null, 'MUR', { compact: true })} sub={`net revenue now ${fmtMoney(S.netRevenue.toString(), 'MUR', { compact: true })}`} tone={beOk(S) ? 'pos' : 'neg'} />
        <Stat label="Break-even GPV" value={fmtMoney(S.breakEvenGpv?.toString() ?? null, 'MUR', { compact: true })} sub={`${fmtNumber(S.breakEvenTxns?.toString() ?? null)} txns · ${fmtNumber(S.requiredMerchants?.toString() ?? null)} merchants`} />
        <Stat label="Margin of safety" value={fmtPct(S.marginOfSafety?.toString() ?? null)} tone={S.marginOfSafety && S.marginOfSafety.lt(0) ? 'neg' : 'pos'} sub={`required take rate ${fmtBps(S.requiredTakeRateBps?.toString() ?? null)}`} />
        <Stat label="Cash break-even revenue" value={fmtMoney(S.cashBreakEvenRevenue?.toString() ?? null, 'MUR', { compact: true })} sub={`cash profit ${fmtMoney(S.operatingCashProfit.toString(), 'MUR', { compact: true })}/month`} tone={S.operatingCashProfit.gte(0) ? 'pos' : 'neg'} />
      </div>

      <Section title="Simulation">
        <Card>
          <CardBody>
            <form method="get" className="no-print grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <KeepParams sp={sp} except={[...PARAM_KEYS]} />
              <div><label className="label" htmlFor="mdr">MDR change (bps)</label><input id="mdr" name="mdr" className="input" inputMode="decimal" defaultValue={cur.mdr} placeholder="e.g. -10" /></div>
              <div><label className="label" htmlFor="growth">Transaction growth (%)</label><input id="growth" name="growth" className="input" inputMode="decimal" defaultValue={cur.growth} placeholder="e.g. 15" /></div>
              <div><label className="label" htmlFor="staff">New staff cost (MUR/month)</label><input id="staff" name="staff" className="input" inputMode="decimal" defaultValue={cur.staff} placeholder="e.g. 120000" /></div>
              <div><label className="label" htmlFor="infra">Infrastructure investment (MUR/month)</label><input id="infra" name="infra" className="input" inputMode="decimal" defaultValue={cur.infra} placeholder="e.g. 25000" /></div>
              <div><label className="label" htmlFor="mix">Product-mix take-rate Δ (bps)</label><input id="mix" name="mix" className="input" inputMode="decimal" defaultValue={cur.mix} placeholder="e.g. 3" /></div>
              <div><label className="label" htmlFor="acq">Acquirer cost change (bps)</label><input id="acq" name="acq" className="input" inputMode="decimal" defaultValue={cur.acq} placeholder="e.g. 5" /></div>
              <div><label className="label" htmlFor="cash">Cash-only fixed outflows (MUR/month)</label><input id="cash" name="cash" className="input" inputMode="decimal" defaultValue={cur.cash} placeholder={dec(c.cashOnlyFixed).toFixed(0)} /></div>
              <div><label className="label" htmlFor="other">Other recurring revenue (GL 4200)</label><select id="other" name="other" className="input" defaultValue={cur.other === '0' ? '0' : '1'}><option value="1">Include</option><option value="0">Exclude</option></select></div>
              <div className="col-span-2 flex items-center gap-2 md:col-span-4 xl:col-span-8"><button className="btn-primary" type="submit">Run simulation</button><Link className="btn" href={`/break-even?range=${encodeURIComponent(period.key)}`}>Reset</Link>
                <span className="text-2xs text-muted">bps changes apply to GPV (1 bp = 0.01 pp). Cash-only outflows default to observed loan repayments ({fmtMoney(c.base.avg.loanRepayments)} / month, bank transactions category “loan”){c.cashDefaulted ? ' — currently defaulted' : ''}.</span></div>
            </form>
          </CardBody>
        </Card>
      </Section>

      <Section title={simulated ? 'Base vs simulated' : 'Base (enter assumptions above to simulate)'}>
        <Card>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr><th className="th">Measure (monthly)</th><th className="th text-right">Base</th><th className="th text-right">Simulated</th><th className="th text-right">Δ</th></tr></thead>
            <tbody>{groups.map((g) => (<Fragment key={g}>
              <tr><td colSpan={4} className="td bg-surface-2 text-2xs font-semibold uppercase tracking-wide text-muted">{g}</td></tr>
              {ROWS.filter((r) => r.group === g).map((r) => { const b = r.get(B), s = r.get(S); const dlt = b !== null && s !== null ? s.minus(b) : null; return (
                <tr key={r.label} className={r.strong ? 'font-semibold' : ''}><td className="td">{r.label}</td><td className="td num text-right">{f(b, r.kind)}</td><td className="td num text-right">{f(s, r.kind)}</td><td className={`td num text-right ${dlt && !dlt.isZero() ? 'text-info' : 'text-muted'}`}>{fd(dlt, r.kind)}</td></tr>); })}
            </Fragment>))}</tbody>
          </table></div>
          <p className="border-t border-border px-4 py-2 text-2xs text-muted">Recurring income (SaaS {fmtMoney(c.base.avg.saas)} + other recurring {p.includeOtherRevenue ? fmtMoney(c.base.avg.otherRevenue) : 'excluded'} = {fmtMoney(c.recurringIncome)} / month) is treated as fixed income that offsets fixed costs; break-even GPV = (fixed − recurring) ÷ variable contribution per GPV. Accounting break-even includes D&amp;A; operating-cash break-even excludes non-cash D&amp;A and adds cash-only fixed outflows ({fmtMoney(c.cashOnlyFixed)}). Required take rate = (fixed + processing − recurring) ÷ GPV. Required merchants = break-even GPV ÷ average GPV per active merchant. {S.breakEvenGpv === null && 'Break-even is undefined when variable contribution per GPV is ≤ 0.'}</p>
        </Card>
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Operating profit vs volume" subtitle="Monthly operating profit at 25 %–250 % of base volume (x = % of base GPV). Crosses zero at break-even." />
          <CardBody><TrendChart data={c.curve} x="label" refLine={0} series={[{ key: 'base', label: 'Base — accounting' }, { key: 'sim', label: 'Simulated — accounting', color: '#b8923d' }, { key: 'simCash', label: 'Simulated — operating cash', color: '#168052' }]} /></CardBody></Card>
        <Card><CardHeader title="Base derivation (trailing 3 months)" subtitle="Every input to the engine, by month, and the monthly average used." />
          <DataTable rows={deriv} filename={`break-even-base-${period.key}`} dense searchable={false} footer={{ ...c.base.avg, label: 'Monthly average' }} columns={[
            { key: 'label', label: 'Month' }, { key: 'gpv', label: 'GPV', kind: 'money' }, { key: 'successes', label: 'Success txns', kind: 'number' }, { key: 'activeMerchants', label: 'Active merchants', kind: 'number', dp: 1 },
            { key: 'mdr', label: 'MDR', kind: 'money' }, { key: 'wholesale', label: 'Wholesale', kind: 'money' }, { key: 'processing', label: 'Processing', kind: 'money' }, { key: 'saas', label: 'SaaS', kind: 'money' },
            { key: 'otherRevenue', label: 'Other rev. (4200)', kind: 'money' }, { key: 'opex', label: 'GL opex', kind: 'money' }, { key: 'dAndA', label: 'GL D&A', kind: 'money' }, { key: 'loanRepayments', label: 'Loan repayments', kind: 'money' },
          ]} /></Card>
      </div>

      <Section title="Evidence snapshots">
        <Card>
          <CardBody>
            {auth.permissions.has('scenario.manage')
              ? <SnapshotForm range={period.key} params={Object.fromEntries(PARAM_KEYS.map((k) => [k, cur[k]]).filter(([, v]) => v !== ''))} />
              : <p className="text-sm text-muted">Recording snapshots requires the <code>scenario.manage</code> permission.</p>}
            <p className="mt-2 text-2xs text-muted">A snapshot recomputes this view server-side and stores the inputs, outputs and SHA-256 hash as an immutable evidence record + audit event — usable as support for a board pack or a CEO decision.</p>
          </CardBody>
          {snaps.length > 0 && <DataTable rows={snaps.map((s: any) => ({ ...s, at: s.created_at instanceof Date ? s.created_at.toISOString().slice(0, 16).replace('T', ' ') : String(s.created_at), sha: String(s.sha256 ?? '').slice(0, 16) }))} filename="break-even-snapshots" dense searchable={false} columns={[{ key: 'reference', label: 'Reference' }, { key: 'at', label: 'Recorded (UTC)' }, { key: 'by', label: 'By' }, { key: 'subject_id', label: 'Period' }, { key: 'description', label: 'Summary' }, { key: 'sha', label: 'SHA-256 (prefix)' }]} />}
        </Card>
      </Section>
      <p className="mt-4 text-2xs text-muted">{beOk(B) ? <Badge tone="pos">above accounting break-even</Badge> : <Badge tone="neg">below accounting break-even</Badge>} Base operating profit {fmtMoney(B.operatingProfit.toString())} / month. <Link className="link" href={`/products?range=${encodeURIComponent(period.key)}`}>Product profitability →</Link> · <Link className="link" href={`/merchants?range=${encodeURIComponent(period.key)}`}>Merchant intelligence →</Link></p>
    </div>
  );
}
