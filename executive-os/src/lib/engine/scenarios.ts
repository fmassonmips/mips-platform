/**
 * Strategic scenario engine (SCENARIO v1).
 *
 * Every template turns validated assumptions + a data context (trailing actuals
 * from the calculation engine) into a monthly incremental projection. Three cases
 * are produced: base (status quo = zero increment), proposed, downside.
 *
 * Outputs per case: incremental revenue, incremental costs, contribution, EBITDA,
 * PBT (EBITDA − incremental D&A), cash flow (EBITDA − capex − working capital − tax),
 * payback month, break-even impact, operational impact and risk exposure.
 * Taxes on incremental profit are applied to cash only when taxRate > 0.
 */
import { z } from 'zod';
import { dec, safeDiv, sum, ZERO, ONE, type Dec } from '../money';
import { simulatePricing, baseResult, type PricingBase } from './pricing';
import { breakEven, type BreakEvenInput } from './breakeven';

export const ENGINE_VERSION = 'SCENARIO-1.0.0';

const decStr = z.union([z.string(), z.number()]).transform((v) => String(v)).refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'Must be a decimal number');
const common = {
  horizonMonths: z.coerce.number().int().min(3).max(60).default(24),
  downsideRevenueHaircut: decStr.default('0.3'),   // fraction of incremental revenue lost in downside
  downsideCostOverrun: decStr.default('0.2'),      // fraction of extra costs in downside
  downsideDelayMonths: z.coerce.number().int().min(0).max(12).default(2),
  taxRate: decStr.default('0'),
};

export const TEMPLATES = {
  merchant_repricing: {
    label: 'Merchant pricing change', category: 'pricing',
    description: 'Change MDR / wholesale / acquirer routing for one merchant, using its trailing actual economics.',
    schema: z.object({ ...common, merchantId: z.string().uuid(), mdrChangeBps: decStr.default('0'), wholesaleChangeBps: decStr.default('0'), migrateShare: decStr.default('0'), migrateWholesaleDeltaBps: decStr.default('0'), volumeGrowthPct: decStr.default('0'), churnProbability: decStr.default('0'), oneOffCost: decStr.default('0') }),
  },
  portfolio_mdr_change: {
    label: 'Reduce / increase merchant MDR (portfolio)', category: 'pricing',
    description: 'Apply an MDR change in bps across the portfolio with an assumed volume response.',
    schema: z.object({ ...common, mdrChangeBps: decStr, volumeGrowthPct: decStr.default('0'), churnProbability: decStr.default('0') }),
  },
  hire_role: {
    label: 'Hire a role (e.g. COO) / increase staffing', category: 'organisation',
    description: 'Monthly loaded cost, recruitment cost and an expected contribution uplift after ramp-up.',
    schema: z.object({ ...common, roleTitle: z.string().min(2).default('Chief Operating Officer'), headcount: z.coerce.number().int().min(1).default(1), monthlyLoadedCost: decStr, recruitmentCost: decStr.default('0'), monthlyContributionUplift: decStr.default('0'), rampMonths: z.coerce.number().int().min(0).max(24).default(6) }),
  },
  automate_onboarding: {
    label: 'Automate merchant onboarding', category: 'operations',
    description: 'Investment that shortens onboarding and adds activations; saves manual effort.',
    schema: z.object({ ...common, investment: decStr, usefulLifeMonths: z.coerce.number().int().min(1).default(36), monthlyRunCost: decStr.default('0'), extraActivationsPerMonth: decStr.default('0'), monthlyStaffSaving: decStr.default('0'), onboardingDaysBefore: decStr.default('0'), onboardingDaysAfter: decStr.default('0'), rampMonths: z.coerce.number().int().min(0).default(3) }),
  },
  merchant_acquisition: {
    label: 'Increase merchant acquisition', category: 'growth',
    description: 'Additional merchants per month at the current average contribution per merchant.',
    schema: z.object({ ...common, newMerchantsPerMonth: decStr, acquisitionCostPerMerchant: decStr.default('0'), monthlySalesCost: decStr.default('0'), rampMonths: z.coerce.number().int().min(0).default(3) }),
  },
  launch_softpos: {
    label: 'Launch SoftPOS', category: 'product',
    description: 'New acceptance product: capex, run cost, adoption and unit economics.',
    schema: z.object({ ...common, capex: decStr, usefulLifeMonths: z.coerce.number().int().min(1).default(36), monthlyRunCost: decStr, merchantsAdoptingPerMonth: decStr, gpvPerMerchantMonthly: decStr, mdrBps: decStr, wholesaleBps: decStr, processingCostPerTxn: decStr.default('0'), avgTicket: decStr, maxMerchants: decStr.default('500') }),
  },
  new_saas_service: {
    label: 'Introduce new SaaS / value-added service', category: 'product',
    description: 'Subscription revenue from merchant adoption.',
    schema: z.object({ ...common, pricePerMerchantMonthly: decStr, adoptionPerMonth: decStr, maxAdopters: decStr, monthlyRunCost: decStr.default('0'), developmentCost: decStr.default('0'), usefulLifeMonths: z.coerce.number().int().min(1).default(36) }),
  },
  acquirer_migration: {
    label: 'Migrate volume between acquirers', category: 'pricing',
    description: 'Route a share of GPV to an acquirer with different wholesale cost.',
    schema: z.object({ ...common, migrateShare: decStr, wholesaleDeltaBps: decStr, migrationCost: decStr.default('0'), successRateDeltaPct: decStr.default('0') }),
  },
  market_expansion: {
    label: 'Expand into a new market', category: 'growth',
    description: 'Setup cost, fixed run cost and revenue ramp to a steady state.',
    schema: z.object({ ...common, setupCost: decStr, monthlyFixedCost: decStr, steadyStateMonthlyRevenue: decStr, contributionMarginPct: decStr.default('0.5'), rampMonths: z.coerce.number().int().min(1).default(12) }),
  },
  infrastructure_investment: {
    label: 'Invest in infrastructure', category: 'operations',
    description: 'Capex that changes run cost and processing cost per transaction.',
    schema: z.object({ ...common, capex: decStr, usefulLifeMonths: z.coerce.number().int().min(1).default(36), monthlyRunCostChange: decStr.default('0'), processingCostChangePerTxn: decStr.default('0'), successRateDeltaPct: decStr.default('0') }),
  },
  lose_strategic_merchant: {
    label: 'Lose a strategic merchant', category: 'risk',
    description: 'Remove a merchant’s trailing contribution and receivables risk.',
    schema: z.object({ ...common, merchantId: z.string().uuid(), monthsUntilLoss: z.coerce.number().int().min(0).default(1), writeOffReceivables: z.coerce.boolean().default(false) }),
  },
  collection_delay: {
    label: 'Delayed customer collections', category: 'risk',
    description: 'Working-capital effect of slower collections (no P&L effect unless bad debt).',
    schema: z.object({ ...common, extraDays: decStr, badDebtPct: decStr.default('0') }),
  },
  regulatory_change: {
    label: 'Change in regulatory requirements', category: 'risk',
    description: 'One-off compliance spend, recurring cost and additional capital to be held.',
    schema: z.object({ ...common, oneOffCost: decStr, monthlyCost: decStr.default('0'), additionalCapitalHeld: decStr.default('0') }),
  },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

/** Trailing actual context supplied by the data layer (monthly averages, base currency). */
export interface ScenarioContext {
  currency: string;
  portfolio: PricingBase & { activeMerchants: string; monthlyRevenue: string; monthlyOpex: string; depreciation: string; attempts: string };
  merchants: Record<string, PricingBase & { name: string; receivables: string }>;
  avgContributionPerMerchant: string;
  creditSalesPerDay: string;
}

interface MonthLine { m: number; revenue: Dec; variableCosts: Dec; fixedCosts: Dec; capex: Dec; depreciation: Dec; workingCapital: Dec; oneOffOpex: Dec }
type Gen = (m: number, f: CaseFactors) => Partial<Omit<MonthLine, 'm'>>;
interface CaseFactors { revenue: Dec; cost: Dec; delay: number }

const ramp = (m: number, rampMonths: number, delay = 0) => { const k = m - delay; if (k <= 0) return ZERO; if (rampMonths <= 0) return ONE; return dec(Math.min(k, rampMonths)).div(rampMonths); };
const straightLine = (capex: Dec, life: number, m: number, startMonth = 1) => (m >= startMonth && m < startMonth + life ? capex.div(life) : ZERO);

function generator(template: TemplateKey, a: any, ctx: ScenarioContext): { gen: Gen; operational: Record<string, string>; risk: string[] } {
  const p = ctx.portfolio;
  switch (template) {
    case 'merchant_repricing': {
      const mb = ctx.merchants[a.merchantId];
      if (!mb) throw new Error('Merchant has no trailing activity in the base period');
      const base = baseResult(mb);
      const sim = simulatePricing(mb, { mdrChangeBps: a.mdrChangeBps, wholesaleChangeBps: a.wholesaleChangeBps, migrateShare: a.migrateShare, migrateWholesaleDeltaBps: a.migrateWholesaleDeltaBps, volumeGrowthPct: a.volumeGrowthPct, churnProbability: a.churnProbability });
      const dRev = sim.netRevenue.minus(base.netRevenue); const dVar = sim.processing.minus(base.processing);
      return {
        gen: (m, f) => ({ revenue: m > f.delay ? dRev.times(dRev.gt(0) ? f.revenue : ONE) : ZERO, variableCosts: m > f.delay ? dVar : ZERO, oneOffOpex: m === 1 ? dec(a.oneOffCost).times(f.cost) : ZERO }),
        operational: { merchant: mb.name, base_take_rate_bps: base.takeRateBps?.toFixed(2) ?? 'n/a', new_take_rate_bps: sim.takeRateBps?.toFixed(2) ?? 'n/a', base_monthly_contribution: base.contribution.toFixed(2), new_monthly_contribution: sim.contribution.toFixed(2) },
        risk: [dec(a.churnProbability).gt(0) ? `Expected-value churn weighting ${dec(a.churnProbability).times(100).toFixed(0)} %` : 'No churn assumed — validate commercial acceptance', 'Contractual price-lock / notice periods must be checked before implementation'],
      };
    }
    case 'portfolio_mdr_change': {
      const base = baseResult(p); const sim = simulatePricing(p, { mdrChangeBps: a.mdrChangeBps, volumeGrowthPct: a.volumeGrowthPct, churnProbability: a.churnProbability });
      const dRev = sim.netRevenue.minus(base.netRevenue); const dVar = sim.processing.minus(base.processing);
      return { gen: (m, f) => ({ revenue: m > f.delay ? (dRev.gt(0) ? dRev.times(f.revenue) : dRev) : ZERO, variableCosts: m > f.delay ? dVar : ZERO }), operational: { mdr_change: `${a.mdrChangeBps} bps (= ${dec(a.mdrChangeBps).div(100).toFixed(2)} percentage points)` }, risk: ['Volume response to price changes is an assumption, not observed data'] };
    }
    case 'hire_role': {
      const cost = dec(a.monthlyLoadedCost).times(a.headcount);
      return { gen: (m, f) => ({ fixedCosts: cost.times(f.cost), oneOffOpex: m === 1 ? dec(a.recruitmentCost).times(f.cost) : ZERO, revenue: dec(a.monthlyContributionUplift).times(ramp(m, a.rampMonths, f.delay)).times(f.revenue) }), operational: { role: a.roleTitle, headcount_added: String(a.headcount) }, risk: ['Contribution uplift from a hire is an estimate; define measurable KPIs for the role'] };
    }
    case 'automate_onboarding': {
      const inv = dec(a.investment); const perMerchant = dec(ctx.avgContributionPerMerchant);
      return {
        gen: (m, f) => { const r = ramp(m, a.rampMonths, f.delay); const cum = dec(a.extraActivationsPerMonth).times(Math.max(0, m - f.delay)); return { capex: m === 1 ? inv.times(f.cost) : ZERO, depreciation: straightLine(inv.times(f.cost), a.usefulLifeMonths, m), fixedCosts: dec(a.monthlyRunCost).times(f.cost).minus(dec(a.monthlyStaffSaving).times(r)), revenue: cum.times(perMerchant).times(r).times(f.revenue) }; },
        operational: { onboarding_days_before: a.onboardingDaysBefore, onboarding_days_after: a.onboardingDaysAfter, extra_activations_per_month: a.extraActivationsPerMonth },
        risk: ['Activation uplift depends on sales pipeline, not only onboarding speed'],
      };
    }
    case 'merchant_acquisition': {
      const perMerchant = dec(ctx.avgContributionPerMerchant);
      return { gen: (m, f) => { const active = dec(a.newMerchantsPerMonth).times(Math.max(0, m - f.delay)); return { revenue: active.times(perMerchant).times(ramp(m, a.rampMonths, f.delay)).times(f.revenue), oneOffOpex: m > f.delay ? dec(a.newMerchantsPerMonth).times(a.acquisitionCostPerMerchant).times(f.cost) : ZERO, fixedCosts: dec(a.monthlySalesCost).times(f.cost) }; }, operational: { merchants_added_over_horizon: dec(a.newMerchantsPerMonth).times(a.horizonMonths).toFixed(0), contribution_per_merchant_monthly: perMerchant.toFixed(2) }, risk: ['Assumes new merchants match current average contribution'] };
    }
    case 'launch_softpos': {
      const capex = dec(a.capex);
      return {
        gen: (m, f) => { const k = Math.max(0, m - f.delay); const merchants = Decimal_min(dec(a.merchantsAdoptingPerMonth).times(k), dec(a.maxMerchants)); const gpv = merchants.times(a.gpvPerMerchantMonthly); const txns = safeDiv(gpv, a.avgTicket) ?? ZERO; const net = gpv.times(dec(a.mdrBps).minus(a.wholesaleBps)).div(10000); return { capex: m === 1 ? capex.times(f.cost) : ZERO, depreciation: straightLine(capex.times(f.cost), a.usefulLifeMonths, m), fixedCosts: dec(a.monthlyRunCost).times(f.cost), revenue: net.times(f.revenue), variableCosts: txns.times(a.processingCostPerTxn).times(f.revenue) }; },
        operational: { steady_state_merchants: a.maxMerchants }, risk: ['Scheme certification and acquirer readiness timelines not modelled', 'Adoption curve is an assumption'],
      };
    }
    case 'new_saas_service': {
      const dev = dec(a.developmentCost);
      return { gen: (m, f) => { const adopters = Decimal_min(dec(a.adoptionPerMonth).times(Math.max(0, m - f.delay)), dec(a.maxAdopters)); return { revenue: adopters.times(a.pricePerMerchantMonthly).times(f.revenue), fixedCosts: dec(a.monthlyRunCost).times(f.cost), capex: m === 1 ? dev.times(f.cost) : ZERO, depreciation: straightLine(dev.times(f.cost), a.usefulLifeMonths, m) }; }, operational: { max_adopters: a.maxAdopters }, risk: ['Revenue recognition for bundled services must follow the documented policy'] };
    }
    case 'acquirer_migration': {
      const saving = dec(p.gpv).times(a.migrateShare).times(dec(a.wholesaleDeltaBps).neg()).div(10000);
      const srGain = dec(p.mdr).minus(p.wholesale).times(a.successRateDeltaPct);
      return { gen: (m, f) => ({ revenue: m > f.delay ? saving.plus(srGain).times(saving.gt(0) ? f.revenue : ONE) : ZERO, oneOffOpex: m === 1 ? dec(a.migrationCost).times(f.cost) : ZERO }), operational: { migrated_gpv_monthly: dec(p.gpv).times(a.migrateShare).toFixed(2) }, risk: ['Acquirer concentration increases on the target bank', 'Contract exit terms with current acquirer not modelled'] };
    }
    case 'market_expansion': {
      return { gen: (m, f) => { const rev = dec(a.steadyStateMonthlyRevenue).times(ramp(m, a.rampMonths, f.delay)).times(f.revenue); return { revenue: rev, variableCosts: rev.times(ONE.minus(a.contributionMarginPct)), fixedCosts: dec(a.monthlyFixedCost).times(f.cost), oneOffOpex: m === 1 ? dec(a.setupCost).times(f.cost) : ZERO }; }, operational: {}, risk: ['Licensing and regulatory approval in the target market not modelled'] };
    }
    case 'infrastructure_investment': {
      const capex = dec(a.capex); const txns = dec(p.successes);
      return { gen: (m, f) => ({ capex: m === 1 ? capex.times(f.cost) : ZERO, depreciation: straightLine(capex.times(f.cost), a.usefulLifeMonths, m), fixedCosts: dec(a.monthlyRunCostChange).times(f.cost), variableCosts: m > f.delay ? txns.times(a.processingCostChangePerTxn) : ZERO, revenue: m > f.delay ? dec(p.mdr).minus(p.wholesale).times(a.successRateDeltaPct).times(f.revenue) : ZERO }), operational: {}, risk: ['Migration/cut-over risk not quantified'] };
    }
    case 'lose_strategic_merchant': {
      const mb = ctx.merchants[a.merchantId]; if (!mb) throw new Error('Merchant has no trailing activity in the base period');
      const b = baseResult(mb);
      return { gen: (m, f) => (m > a.monthsUntilLoss ? { revenue: b.netRevenue.neg(), variableCosts: b.processing.neg() } : m === a.monthsUntilLoss && a.writeOffReceivables ? { oneOffOpex: dec(mb.receivables) } : {}), operational: { merchant: mb.name, monthly_contribution_lost: b.contribution.toFixed(2), monthly_gpv_lost: b.gpv.toFixed(2) }, risk: ['Downside also reflects reduced negotiating position with acquirers'] };
    }
    case 'collection_delay': {
      const wc = dec(ctx.creditSalesPerDay).times(a.extraDays);
      return { gen: (m, f) => ({ workingCapital: m === 1 + f.delay ? wc.times(f.cost) : ZERO, oneOffOpex: dec(ctx.portfolio.monthlyRevenue).times(a.badDebtPct).times(f.cost) }), operational: { cash_tied_up: wc.toFixed(2) }, risk: ['No P&L effect unless receivables become uncollectible'] };
    }
    case 'regulatory_change': {
      return { gen: (m, f) => ({ oneOffOpex: m === 1 ? dec(a.oneOffCost).times(f.cost) : ZERO, fixedCosts: dec(a.monthlyCost).times(f.cost), workingCapital: m === 1 ? dec(a.additionalCapitalHeld) : ZERO }), operational: { capital_held: a.additionalCapitalHeld }, risk: ['Requirement interpretation must be confirmed with the regulator/compliance'] };
    }
  }
}
function Decimal_min(a: Dec, b: Dec) { return a.lt(b) ? a : b; }

export interface CaseResult {
  months: { m: number; revenue: string; costs: string; contribution: string; ebitda: string; pbt: string; cashFlow: string; cumulativeCash: string }[];
  totals: { revenue: string; costs: string; contribution: string; ebitda: string; pbt: string; cashFlow: string; capex: string };
  annualised: { revenue: string; ebitda: string; pbt: string; cashFlow: string };
  steadyStateMonthly: { revenue: string; contribution: string; ebitda: string };
  paybackMonth: number | null;
  breakEvenGpvChange: string | null;
}
export interface ScenarioOutput { engineVersion: string; template: TemplateKey; currency: string; horizonMonths: number; base: CaseResult; proposed: CaseResult; downside: CaseResult; operational: Record<string, string>; risks: string[]; riskExposure: string; sensitivities: { label: string; ebitda: string; cashFlow: string }[] }

function project(gen: Gen, horizon: number, f: CaseFactors, taxRate: Dec, ctx: ScenarioContext): CaseResult {
  const months: CaseResult['months'] = [];
  let cum = ZERO, tRev = ZERO, tCost = ZERO, tCm = ZERO, tE = ZERO, tP = ZERO, tC = ZERO, tCapex = ZERO; let payback: number | null = null; let wasNegative = false;
  let last = { revenue: ZERO, cm: ZERO, e: ZERO };
  for (let m = 1; m <= horizon; m++) {
    const l = gen(m, f);
    const revenue = dec(l.revenue ?? 0), v = dec(l.variableCosts ?? 0), fx = dec(l.fixedCosts ?? 0), one = dec(l.oneOffOpex ?? 0), capex = dec(l.capex ?? 0), dep = dec(l.depreciation ?? 0), wc = dec(l.workingCapital ?? 0);
    const contribution = revenue.minus(v);
    const ebitda = contribution.minus(fx).minus(one);
    const pbt = ebitda.minus(dep);
    const tax = pbt.gt(0) ? pbt.times(taxRate) : ZERO;
    const cash = ebitda.minus(capex).minus(wc).minus(tax);
    cum = cum.plus(cash);
    if (cum.lt(0)) wasNegative = true;
    if (payback === null && wasNegative && cum.gte(0)) payback = m;
    tRev = tRev.plus(revenue); tCost = tCost.plus(v).plus(fx).plus(one); tCm = tCm.plus(contribution); tE = tE.plus(ebitda); tP = tP.plus(pbt); tC = tC.plus(cash); tCapex = tCapex.plus(capex);
    months.push({ m, revenue: revenue.toFixed(2), costs: v.plus(fx).plus(one).toFixed(2), contribution: contribution.toFixed(2), ebitda: ebitda.toFixed(2), pbt: pbt.toFixed(2), cashFlow: cash.toFixed(2), cumulativeCash: cum.toFixed(2) });
    last = { revenue, cm: contribution.minus(fx), e: ebitda };
  }
  if (!wasNegative && tC.gte(0)) payback = 0; // never negative: immediate payback
  const ann = (x: Dec) => x.div(horizon).times(12).toFixed(2);
  // Break-even impact: re-run portfolio break-even with steady-state monthly increments
  const p = ctx.portfolio;
  const beIn: BreakEvenInput = { gpv: p.gpv, successes: p.successes, activeMerchants: p.activeMerchants, mdr: p.mdr, wholesale: p.wholesale, processing: p.processing, saas: p.saas, fixedCosts: p.monthlyOpex, depreciation: p.depreciation };
  const be0 = breakEven(beIn);
  const be1 = breakEven({ ...beIn, saas: dec(p.saas).plus(last.cm.gt(0) ? last.cm : ZERO), fixedCosts: dec(p.monthlyOpex).plus(last.cm.lt(0) ? last.cm.neg() : ZERO) });
  const beChange = be0.breakEvenGpv && be1.breakEvenGpv ? be1.breakEvenGpv.minus(be0.breakEvenGpv).toFixed(2) : null;
  return { months, totals: { revenue: tRev.toFixed(2), costs: tCost.toFixed(2), contribution: tCm.toFixed(2), ebitda: tE.toFixed(2), pbt: tP.toFixed(2), cashFlow: tC.toFixed(2), capex: tCapex.toFixed(2) }, annualised: { revenue: ann(tRev), ebitda: ann(tE), pbt: ann(tP), cashFlow: ann(tC) }, steadyStateMonthly: { revenue: last.revenue.toFixed(2), contribution: last.cm.toFixed(2), ebitda: last.e.toFixed(2) }, paybackMonth: payback, breakEvenGpvChange: beChange };
}

export function runScenario(template: TemplateKey, rawAssumptions: unknown, ctx: ScenarioContext): ScenarioOutput {
  const def = TEMPLATES[template];
  if (!def) throw new Error(`Unknown scenario template ${template}`);
  const a: any = def.schema.parse(rawAssumptions);
  const { gen, operational, risk } = generator(template, a, ctx);
  const tax = dec(a.taxRate);
  const zeroGen: Gen = () => ({});
  const base = project(zeroGen, a.horizonMonths, { revenue: ONE, cost: ONE, delay: 0 }, tax, ctx);
  const proposed = project(gen, a.horizonMonths, { revenue: ONE, cost: ONE, delay: 0 }, tax, ctx);
  const downside = project(gen, a.horizonMonths, { revenue: ONE.minus(a.downsideRevenueHaircut), cost: ONE.plus(a.downsideCostOverrun), delay: a.downsideDelayMonths }, tax, ctx);
  const sens = [
    { label: 'Revenue −10 %', f: { revenue: dec('0.9'), cost: ONE, delay: 0 } },
    { label: 'Revenue +10 %', f: { revenue: dec('1.1'), cost: ONE, delay: 0 } },
    { label: 'Costs +10 %', f: { revenue: ONE, cost: dec('1.1'), delay: 0 } },
    { label: 'Delay 3 months', f: { revenue: ONE, cost: ONE, delay: 3 } },
  ].map((s) => { const r = project(gen, a.horizonMonths, s.f, tax, ctx); return { label: s.label, ebitda: r.totals.ebitda, cashFlow: r.totals.cashFlow }; });
  const exposure = dec(downside.totals.cashFlow).minus(dec(proposed.totals.cashFlow));
  return { engineVersion: ENGINE_VERSION, template, currency: ctx.currency, horizonMonths: a.horizonMonths, base, proposed, downside, operational, risks: risk, riskExposure: exposure.toFixed(2), sensitivities: sens };
}

