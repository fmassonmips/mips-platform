import { describe, it, expect } from 'vitest';
import { simulatePricing, baseResult, pricingLadder, breakEvenVolumeForPriceChange } from '@/lib/engine/pricing';
import { breakEven } from '@/lib/engine/breakeven';
import { runway } from '@/lib/engine/runway';

const m = { gpv: '10000000', successes: '4000', mdr: '195000', wholesale: '150000', processing: '12000', saas: '3000' };

describe('pricing simulation (basis points)', () => {
  it('a 20 bps reduction lowers MDR by 0.20 percentage points, not by 20 %', () => {
    const r = simulatePricing(m, { mdrChangeBps: -20 });
    expect(r.mdr.toString()).toBe('175000');                 // 1.95 % → 1.75 %
    expect(r.effectiveMdrBps!.toString()).toBe('175');
    expect(r.mdr.toString()).not.toBe('156000');             // the wrong "−20 %" answer
  });
  it('ladder covers −5/−10/−20/−30 bps with revenue & contribution deltas', () => {
    const l = pricingLadder(m);
    expect(l.map((x) => x.changeBps)).toEqual([-5, -10, -20, -30]);
    expect(l[2].deltaRevenue.toString()).toBe('-20000');
    expect(l[2].deltaContribution.toString()).toBe('-20000');
  });
  it('wholesale increase and acquirer migration', () => {
    const r = simulatePricing(m, { wholesaleChangeBps: 35 });
    expect(r.wholesale.toString()).toBe('185000');
    const mig = simulatePricing(m, { migrateShare: '0.6', migrateWholesaleDeltaBps: -40 });
    expect(mig.wholesale.toString()).toBe('126000'); // 150 000 − 6m × 0.40 %
  });
  it('volume growth scales economics; churn is expected-value weighted', () => {
    const g = simulatePricing(m, { volumeGrowthPct: '0.1' });
    expect(g.gpv.toString()).toBe('11000000');
    expect(g.processing.toString()).toBe('13200');
    const c = simulatePricing(m, { churnProbability: '0.25' });
    expect(c.contribution.toString()).toBe(baseResult(m).contribution.times('0.75').toString());
  });
  it('volume needed to offset a price cut', () => {
    const v = breakEvenVolumeForPriceChange(m, -10)!;
    // base variable contribution 33 000 on 10m; after −10 bps: 23 000 → needs +43.48 %
    expect(v.toFixed(4)).toBe('0.4348');
  });
});

describe('break-even', () => {
  const be = breakEven({ gpv: '100000000', successes: '50000', activeMerchants: '50', mdr: '1800000', wholesale: '1200000', processing: '100000', saas: '50000', fixedCosts: '600000', depreciation: '40000' });
  it('accounting break-even GPV = (fixed − SaaS) / variable contribution per unit GPV', () => {
    // variable contribution = 1 800 000 − 1 200 000 − 100 000 = 500 000 → 50 bps
    expect(be.contributionPerGpvBps!.toString()).toBe('50');
    expect(be.breakEvenGpv!.toString()).toBe('110000000');
    expect(be.breakEvenTxns!.toString()).toBe('55000');
    expect(be.requiredMerchants!.toString()).toBe('55');
  });
  it('operating-cash break-even excludes D&A', () => {
    expect(be.cashBreakEvenGpv!.toString()).toBe('102000000');
    expect(be.operatingProfit.toString()).toBe('-50000');
  });
  it('required take rate covers fixed + processing − SaaS', () => {
    expect(be.requiredTakeRateBps!.toString()).toBe('65');
  });
});

describe('runway', () => {
  it('cash-generative business shows NO finite runway', () => {
    const r = runway({ unrestrictedCash: '5000000', restrictedCash: '9000000', monthlyNetCashFlows: ['100000', '-20000', '50000'], minimumLiquidity: '1000000' });
    expect(r.status).toBe('cash_generative');
    expect(r.runwayMonths).toBeNull();
  });
  it('burning business: runway excludes restricted cash', () => {
    const r = runway({ unrestrictedCash: '1200000', restrictedCash: '9000000', monthlyNetCashFlows: ['-100000', '-200000'], minimumLiquidity: '300000' });
    expect(r.status).toBe('burning');
    expect(r.runwayMonths!.toString()).toBe('8');
    expect(r.runwayToMinimumMonths!.toString()).toBe('6');
  });
});
