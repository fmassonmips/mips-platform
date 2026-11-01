import { describe, it, expect } from 'vitest';
import { decomposeContribution, segmentMerchants, pricingOpportunities, trendMetrics, contractConstraint, parseDecimalInput, type SegmentInput, type MonthEcon } from '@/lib/services/segmentation';
import { dec } from '@/lib/money';
import { allocate } from '@/lib/engine/economics';

const sumEffects = (b: ReturnType<typeof decomposeContribution>) => dec(b.volume).plus(b.mdrRate).plus(b.wholesaleRate).plus(b.processing).plus(b.saas);

describe('contribution change decomposition', () => {
  const aug: MonthEcon = { month: '2026-08-01', gpv: '26975918.33', mdr: '700000.11', wholesale: '370000.37', processing: '15735.07', saas: '15000' };
  // Same volume, wholesale +35 bps on 72 % of GPV
  const sep: MonthEcon = { month: '2026-09-01', gpv: '28511001.17', mdr: '739900.73', wholesale: '463000.19', processing: '16595.3', saas: '15000' };

  it('effects sum exactly to the contribution change', () => {
    const b = decomposeContribution(aug, sep);
    expect(sumEffects(b).toString()).toBe(dec(b.change).toString());
    expect(b.check).toBe('0');
    expect(dec(b.change).toString()).toBe(dec(b.contributionTo).minus(b.contributionFrom).toString());
  });

  it('isolates a wholesale rate increase as the wholesale effect', () => {
    const a = { month: 'a', gpv: '1000000', mdr: '25000', wholesale: '16000', processing: '1000', saas: '500' };
    const b = { month: 'b', gpv: '1000000', mdr: '25000', wholesale: '19500', processing: '1000', saas: '500' }; // 160 → 195 bps
    const r = decomposeContribution(a, b);
    expect(r.wholesaleRate).toBe('-3500');
    expect(r.volume).toBe('0'); expect(r.mdrRate).toBe('0'); expect(r.processing).toBe('0'); expect(r.saas).toBe('0');
    expect(r.wholesaleBpsFrom).toBe('160'); expect(r.wholesaleBpsTo).toBe('195');
  });

  it('pure volume growth at constant rates is all volume effect', () => {
    const a = { month: 'a', gpv: '1000000', mdr: '25000', wholesale: '16000', processing: '1000', saas: '0' };
    const b = { month: 'b', gpv: '1200000', mdr: '30000', wholesale: '19200', processing: '1000', saas: '0' };
    const r = decomposeContribution(a, b);
    expect(r.volume).toBe('1800'); expect(r.mdrRate).toBe('0'); expect(r.wholesaleRate).toBe('0');
  });

  it('handles a base month without volume and non-terminating ratios', () => {
    const z = decomposeContribution({ month: 'a', gpv: '0', mdr: '0', wholesale: '0', processing: '12.5', saas: '1000' }, { month: 'b', gpv: '333333.33', mdr: '7777.77', wholesale: '3333.33', processing: '400', saas: '1500' });
    expect(z.check).toBe('0');
    expect(z.volume).toBe('4444.44');
    const odd = decomposeContribution({ month: 'a', gpv: '3', mdr: '1', wholesale: '0.7', processing: '0', saas: '0' }, { month: 'b', gpv: '7', mdr: '2', wholesale: '1.1', processing: '0.3', saas: '0' });
    expect(odd.check).toBe('0');
    expect(sumEffects(odd).toString()).toBe(odd.change);
  });
});

const mk = (o: Partial<SegmentInput> & { id: string }): SegmentInput => ({
  code: o.id, name: o.id, gpv: '1000000', successes: '100', mdr: '20000', wholesale: '12000', processing: '1000', netRevenue: '8000', contribution: '7000',
  commercialImportance: 3, churnRisk: 2, priceLockedUntil: null, contractNotes: null, trend: null, ...o,
});

describe('merchant segmentation', () => {
  const today = '2026-10-31';
  const portfolio: SegmentInput[] = [
    mk({ id: 'STAR', gpv: '5000000', mdr: '120000', wholesale: '60000', processing: '3000', netRevenue: '60000', contribution: '57000' }),         // 114 bps
    mk({ id: 'BIGLOW', gpv: '4000000', mdr: '70000', wholesale: '45000', processing: '3000', netRevenue: '25000', contribution: '22000' }),        // 55 bps, wh/mdr 64 %
    mk({ id: 'ROUTE', gpv: '4500000', mdr: '110000', wholesale: '90000', processing: '2000', netRevenue: '20000', contribution: '18000' }),        // wh/mdr 82 %
    mk({ id: 'LOSS', gpv: '200000', mdr: '3000', wholesale: '2900', processing: '500', netRevenue: '100', contribution: '-400', commercialImportance: 1 }),
    mk({ id: 'LOSSVIP', gpv: '300000', mdr: '3000', wholesale: '2900', processing: '500', netRevenue: '100', contribution: '-400', commercialImportance: 5 }),
    mk({ id: 'SMALL', gpv: '300000', mdr: '7000', wholesale: '3000', processing: '300', netRevenue: '4000', contribution: '3700', trend: { growth: '0.05', unitMarginTrendBps: '0', wholesaleTrendBps: '0', mdrTrendBps: '0', latestUnitMarginBps: '123' } }), // 123 bps, growing
    mk({ id: 'SHRINK', gpv: '300000', mdr: '7000', wholesale: '3000', processing: '300', netRevenue: '4000', contribution: '3700', trend: { growth: '-0.2', unitMarginTrendBps: '0', wholesaleTrendBps: '0', mdrTrendBps: '0', latestUnitMarginBps: '123' } }),
    mk({ id: 'SHOCK', gpv: '6000000', mdr: '170000', wholesale: '90000', processing: '3000', netRevenue: '80000', contribution: '77000', trend: { growth: '0.02', unitMarginTrendBps: '-20', wholesaleTrendBps: '25', mdrTrendBps: '0', latestUnitMarginBps: '128' }, contractNotes: 'Annual price review each 1 Nov' }),
    mk({ id: 'IDLE', gpv: '0', mdr: '0', wholesale: '0', processing: '0', netRevenue: '0', contribution: '0' }),
  ];
  const out = segmentMerchants(portfolio, { today });
  const seg = (id: string) => out.rows.find((r) => r.id === id)!;

  it('classifies into actionable segments', () => {
    expect(seg('STAR').segment).toBe('protect_grow');
    expect(seg('BIGLOW').segment).toBe('reprice');
    expect(seg('ROUTE').segment).toBe('optimise_routing');
    expect(seg('LOSS').segment).toBe('exit_restructure');
    expect(seg('LOSSVIP').segment).toBe('reprice');
    expect(seg('SMALL').segment).toBe('protect_grow');   // high margin, low volume but growing
    expect(seg('SHRINK').segment).toBe('monitor');       // high margin, low and shrinking volume
    expect(seg('SHRINK').flags.some((f) => f.startsWith('Volume declining'))).toBe(true);
    expect(seg('SHOCK').segment).toBe('optimise_routing');
    expect(seg('IDLE').segment).toBe('monitor');
  });
  it('counts and concentration flags are consistent', () => {
    const n = Object.values(out.counts).reduce((a, b) => a + b, 0);
    expect(n).toBe(portfolio.length);
    expect(seg('SHOCK').flags.some((f) => f.startsWith('Concentration'))).toBe(true);
    expect(seg('SHOCK').constrained).toBe(true);
    const shares = out.rows.reduce((a, r) => a.plus(dec(r.revenueShare ?? 0)), dec(0));
    expect(shares.toDecimalPlaces(4).toString()).toBe('1');
  });
  it('portfolio thresholds are volume-weighted', () => {
    const active = portfolio.filter((m) => dec(m.gpv).gt(0));
    const exp = active.reduce((a, m) => a.plus(dec(m.contribution)), dec(0)).div(active.reduce((a, m) => a.plus(dec(m.gpv)), dec(0))).times(10000);
    expect(dec(out.thresholds.portfolioUnitMarginBps!).toFixed(4)).toBe(exp.toFixed(4));
  });
});

describe('pricing opportunities respect commercial constraints', () => {
  const today = '2026-10-31';
  const inputs: SegmentInput[] = [
    mk({ id: 'A', gpv: '6000000', mdr: '170000', wholesale: '90000', processing: '3000', netRevenue: '80000', contribution: '77000', trend: { growth: '0', unitMarginTrendBps: '-20', wholesaleTrendBps: '24.3', mdrTrendBps: '0', latestUnitMarginBps: '120' } }),
    mk({ id: 'LOCKED', gpv: '6000000', mdr: '170000', wholesale: '90000', processing: '3000', netRevenue: '80000', contribution: '77000', priceLockedUntil: '2027-03-31', trend: { growth: '0', unitMarginTrendBps: '-20', wholesaleTrendBps: '24.3', mdrTrendBps: '0', latestUnitMarginBps: '120' } }),
    mk({ id: 'EXPIRED', gpv: '4000000', mdr: '70000', wholesale: '45000', processing: '3000', netRevenue: '25000', contribution: '22000', priceLockedUntil: '2026-01-31' }),
    mk({ id: 'OK', gpv: '5000000', mdr: '150000', wholesale: '60000', processing: '3000', netRevenue: '90000', contribution: '87000' }),
  ];
  const seg = segmentMerchants(inputs, { today });
  const ops = pricingOpportunities(seg, inputs, 3);
  const op = (id: string) => ops.find((o) => o.id === id);

  it('flags price-locked merchants as constrained and never recommends immediate repricing', () => {
    expect(op('LOCKED')!.status).toBe('constrained');
    expect(op('LOCKED')!.recommendation).toMatch(/NOT recommended for immediate repricing/);
    expect(op('A')!.status).toBe('candidate');
    expect(op('EXPIRED')!.status).toBe('candidate'); // lock in the past
  });
  it('passes through the wholesale increase and states evidence and uncertainty', () => {
    const a = op('A')!;
    expect(a.suggestedMdrChangeBps).toBe('25');
    expect(a.monthlyImpact).toBe('5000');                 // 2 000 000 monthly GPV × 25 bps
    expect(a.evidence.join(' ')).toMatch(/Wholesale \+24\.3 bps/);
    expect(a.uncertainty.join(' ')).toMatch(/churn probability exceeds/);
    // break-even churn: 5 000 / (25 666.67 + 5 000)
    expect(dec(a.breakEvenChurnProbability!).toFixed(4)).toBe('0.1630');
  });
  it('healthy merchants get no opportunity; constrained ones sort last', () => {
    expect(op('OK')).toBeUndefined();
    expect(ops[ops.length - 1].status).toBe('constrained');
  });
  it('contract notes alone constrain repricing', () => {
    expect(contractConstraint({ contractNotes: 'MFN clause' }, today)).toBe('MFN clause');
    expect(contractConstraint({ priceLockedUntil: '2026-10-31' }, today)).toBeNull();
  });
});

describe('trend metrics', () => {
  const m = (month: string, gpv: string, wh: string) => ({ month, gpv, mdr: dec(gpv).times('0.025').toString(), wholesale: wh, processing: '0', saas: '0' });
  it('growth is last 3 vs prior 3 months; wholesale trend is latest vs 3-month baseline', () => {
    const t = trendMetrics([m('05', '100', '1.6'), m('06', '100', '1.6'), m('07', '100', '1.6'), m('08', '100', '1.6'), m('09', '110', '1.76'), m('10', '120', '2.34')]);
    expect(t.growth).toBe('0.1');
    expect(t.wholesaleTrendBps).toBe('35');   // 160 → 195 bps
    expect(t.mdrTrendBps).toBe('0');
  });
  it('returns nulls without enough history', () => {
    const t = trendMetrics([m('10', '100', '1')]);
    expect(t.growth).toBeNull(); expect(t.wholesaleTrendBps).toBeNull();
  });
});

describe('inputs and allocation', () => {
  it('parses decimal inputs strictly', () => {
    expect(parseDecimalInput('-20', 'x')!.toString()).toBe('-20');
    expect(parseDecimalInput('+1,500.5', 'x')!.toString()).toBe('1500.5');
    expect(parseDecimalInput('', 'x')).toBeNull();
    expect(() => parseDecimalInput('20%', 'x')).toThrow();
    expect(() => parseDecimalInput('120', 'x', { max: 100 })).toThrow();
  });
  it('overhead allocations sum exactly to the pool', () => {
    const a = allocate('1000000.01', { a: '3', b: '3', c: '3' });
    expect(Object.values(a).reduce((x, y) => x.plus(y), dec(0)).toString()).toBe('1000000.01');
  });
});
