/**
 * Merchant analytics — PURE functions (no database access), unit tested in
 * tests/unit/merchants.test.ts.
 *
 *  - trendMetrics          growth and unit-economics trends from monthly economics
 *  - segmentMerchants      actionable segmentation (SEGMENT v1, rules documented below)
 *  - pricingOpportunities  repricing / routing candidates that respect contractual constraints
 *  - decomposeContribution contribution change between two months, split into
 *                          volume / MDR rate / wholesale rate / processing / SaaS (sums exactly)
 *
 * Units: money as decimal strings (base currency); rates in basis points
 * (1 bp = 0.01 percentage point); growth / shares as fractions (0.10 = 10 %).
 */
import { dec, safeDiv, ZERO, type Dec, type DecLike } from '../money';

const s = (d: Dec | null, dp = 6) => (d === null ? null : d.toDecimalPlaces(dp).toString());
const bpsOf = (x: DecLike, gpv: DecLike) => { const v = safeDiv(x, gpv); return v ? v.times(10000) : null; };

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------
export interface MonthEcon { month: string; gpv: DecLike; successes?: DecLike; mdr: DecLike; wholesale: DecLike; processing: DecLike; saas: DecLike }

export interface TrendMetrics {
  /** avg GPV of the last 3 months vs avg of the 3 months before (fraction) */
  growth: string | null;
  /** payment unit margin (MDR − wholesale − processing)/GPV: latest month − avg of 3 preceding months (bps) */
  unitMarginTrendBps: string | null;
  /** wholesale/GPV: latest month − avg of 3 preceding months (bps) */
  wholesaleTrendBps: string | null;
  /** MDR/GPV: latest month − avg of 3 preceding months (bps) */
  mdrTrendBps: string | null;
  latestUnitMarginBps: string | null;
}

/** `months` must be sorted ascending; the last element is the latest month. */
export function trendMetrics(months: MonthEcon[]): TrendMetrics {
  const n = months.length;
  const sumK = (xs: MonthEcon[], k: keyof MonthEcon) => xs.reduce((a, x) => a.plus(dec(x[k] as DecLike)), ZERO);
  let growth: Dec | null = null;
  if (n >= 6) {
    const last3 = sumK(months.slice(n - 3), 'gpv'), prev3 = sumK(months.slice(n - 6, n - 3), 'gpv');
    const g = safeDiv(last3, prev3); growth = g ? g.minus(1) : null;
  }
  const out: TrendMetrics = { growth: s(growth), unitMarginTrendBps: null, wholesaleTrendBps: null, mdrTrendBps: null, latestUnitMarginBps: null };
  if (n === 0) return out;
  const cur = months[n - 1];
  const unit = (m: Dec, w: Dec, p: Dec, g: Dec) => bpsOf(m.minus(w).minus(p), g);
  const cu = unit(dec(cur.mdr), dec(cur.wholesale), dec(cur.processing), dec(cur.gpv));
  out.latestUnitMarginBps = s(cu, 4);
  if (n < 4 || cu === null) return out;
  const base = months.slice(n - 4, n - 1);
  const bg = sumK(base, 'gpv');
  const bu = unit(sumK(base, 'mdr'), sumK(base, 'wholesale'), sumK(base, 'processing'), bg);
  const cw = bpsOf(cur.wholesale, cur.gpv), bw = bpsOf(sumK(base, 'wholesale'), bg);
  const cm = bpsOf(cur.mdr, cur.gpv), bm = bpsOf(sumK(base, 'mdr'), bg);
  out.unitMarginTrendBps = bu ? s(cu.minus(bu), 4) : null;
  out.wholesaleTrendBps = cw && bw ? s(cw.minus(bw), 4) : null;
  out.mdrTrendBps = cm && bm ? s(cm.minus(bm), 4) : null;
  return out;
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------
export type SegmentCode = 'protect_grow' | 'reprice' | 'optimise_routing' | 'monitor' | 'exit_restructure';
export const SEGMENTS: Record<SegmentCode, { label: string; action: string; tone: 'pos' | 'warn' | 'info' | 'neutral' | 'neg' }> = {
  protect_grow: { label: 'Protect & grow', tone: 'pos', action: 'Protect the relationship: service levels, volume growth, cross-sell. No price concession needed.' },
  reprice: { label: 'Reprice', tone: 'warn', action: 'Review MDR / minimum fees: unit margin is below the portfolio average and wholesale cost is not the main cause.' },
  optimise_routing: { label: 'Optimise routing', tone: 'info', action: 'Reduce wholesale cost: route volume to a lower-cost acquirer or renegotiate the fee schedule before touching merchant price.' },
  monitor: { label: 'Monitor', tone: 'neutral', action: 'No action now — review monthly.' },
  exit_restructure: { label: 'Exit or restructure', tone: 'neg', action: 'Contribution negative or sub-scale: restructure terms (minimum monthly fee / SaaS bundle) or plan an orderly exit.' },
};

export interface SegmentInput {
  id: string; code: string; name: string; status?: string;
  gpv: DecLike; successes: DecLike; mdr: DecLike; wholesale: DecLike; processing?: DecLike; netRevenue: DecLike; contribution: DecLike;
  commercialImportance: number; churnRisk: number; growthPotential?: number;
  priceLockedUntil?: string | null; contractNotes?: string | null;
  trend?: TrendMetrics | null;
}

export interface SegmentOpts {
  today: string;                       // ISO date — contractual constraints are evaluated against it
  concentrationThreshold?: DecLike;    // share of portfolio net revenue (default 0.10)
  routingGapThreshold?: DecLike;       // wholesale/MDR above portfolio by this (default 0.05 = 5 pp)
  wholesaleShockBps?: DecLike;         // wholesale trend that triggers routing review (default 5 bps)
}

export interface SegmentResult {
  id: string; code: string; name: string; segment: SegmentCode; segmentLabel: string; action: string; reasons: string[]; flags: string[];
  gpv: string; netRevenue: string; contribution: string;
  unitMarginBps: string | null; wholesaleToMdr: string | null; revenueShare: string | null; growth: string | null;
  volumeHigh: boolean; marginHigh: boolean; constrained: boolean; constraint: string | null;
  commercialImportance: number; churnRisk: number;
}

export interface SegmentationOutput {
  rows: SegmentResult[];
  thresholds: { portfolioUnitMarginBps: string | null; medianGpv: string; portfolioWholesaleToMdr: string | null; portfolioWholesaleBps: string | null; concentrationThreshold: string; routingGapThreshold: string; wholesaleShockBps: string };
  counts: Record<SegmentCode, number>;
}

/** Contractual constraint text, or null when the merchant can be repriced now. */
export function contractConstraint(m: { priceLockedUntil?: string | null; contractNotes?: string | null }, today: string): string | null {
  const parts: string[] = [];
  if (m.priceLockedUntil && m.priceLockedUntil > today) parts.push(`Price locked until ${m.priceLockedUntil}`);
  if (m.contractNotes && m.contractNotes.trim()) parts.push(m.contractNotes.trim());
  return parts.length ? parts.join(' · ') : null;
}

function median(xs: Dec[]): Dec {
  if (!xs.length) return ZERO;
  const a = [...xs].sort((x, y) => x.cmp(y)); const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : a[mid - 1].plus(a[mid]).div(2);
}

/**
 * SEGMENT v1 rules (evaluated in order). Thresholds are portfolio-relative:
 *   high margin  = contribution/GPV ≥ portfolio contribution/GPV
 *   high volume  = GPV ≥ median GPV of merchants with volume
 *   1. no volume in period                          → Monitor (inactive)
 *   2. contribution < 0: importance ≥ 4 or concentration → Reprice (restructure terms) else Exit or restructure
 *   3. wholesale up ≥ shock bps and high volume      → Optimise routing (cost shock, e.g. acquirer fee increase)
 *   4. high margin: high volume or growth ≥ 0        → Protect & grow, else Monitor
 *   5. low margin, high volume: wholesale/MDR ≥ portfolio + gap AND wholesale bps ≥ portfolio → Optimise routing,
 *                               else Reprice (the margin gap is price-driven, not cost-driven)
 *   6. low margin, low volume: margin < 25 % of portfolio and importance ≤ 2 → Exit or restructure,
 *                              margin < 50 % of portfolio → Reprice, else Monitor
 * Overlays (flags): concentration risk, high churn risk (≥ 4/5), strategic (importance ≥ 4),
 * contractual constraint, declining volume, margin erosion.
 */
export function segmentMerchants(inputs: SegmentInput[], opts: SegmentOpts): SegmentationOutput {
  const conc = dec(opts.concentrationThreshold ?? '0.10');
  const gap = dec(opts.routingGapThreshold ?? '0.05');
  const shock = dec(opts.wholesaleShockBps ?? 5);
  const active = inputs.filter((m) => dec(m.gpv).gt(0));
  const totGpv = active.reduce((a, m) => a.plus(dec(m.gpv)), ZERO);
  const totCm = active.reduce((a, m) => a.plus(dec(m.contribution)), ZERO);
  const totMdr = active.reduce((a, m) => a.plus(dec(m.mdr)), ZERO);
  const totWh = active.reduce((a, m) => a.plus(dec(m.wholesale)), ZERO);
  const totNet = inputs.reduce((a, m) => a.plus(dec(m.netRevenue).gt(0) ? dec(m.netRevenue) : ZERO), ZERO);
  const pUnit = bpsOf(totCm, totGpv);
  const pWhMdr = safeDiv(totWh, totMdr);
  const pWhBps = bpsOf(totWh, totGpv);
  const medGpv = median(active.map((m) => dec(m.gpv)));
  const counts: Record<SegmentCode, number> = { protect_grow: 0, reprice: 0, optimise_routing: 0, monitor: 0, exit_restructure: 0 };

  const rows = inputs.map((m): SegmentResult => {
    const gpv = dec(m.gpv), cm = dec(m.contribution), net = dec(m.netRevenue);
    const unit = bpsOf(cm, gpv);
    const whMdr = safeDiv(m.wholesale, m.mdr);
    const share = net.gt(0) ? safeDiv(net, totNet) : ZERO;
    const growth = m.trend?.growth ? dec(m.trend.growth) : null;
    const whTrend = m.trend?.wholesaleTrendBps ? dec(m.trend.wholesaleTrendBps) : null;
    const volumeHigh = gpv.gt(0) && gpv.gte(medGpv);
    const marginHigh = unit !== null && pUnit !== null && unit.gte(pUnit);
    const constraint = contractConstraint(m, opts.today);
    const reasons: string[] = []; const flags: string[] = [];
    const fmt = (d: Dec | null, dp = 1) => (d === null ? '—' : d.toFixed(dp));
    let seg: SegmentCode;
    if (gpv.isZero()) { seg = 'monitor'; reasons.push('No processed volume in the period'); flags.push('Inactive'); }
    else if (cm.lt(0)) {
      reasons.push(`Contribution negative (${fmt(unit)} bps of GPV)`);
      if (m.commercialImportance >= 4 || (share && share.gte(conc))) { seg = 'reprice'; reasons.push('Strategic / concentrated account — restructure terms rather than exit'); }
      else seg = 'exit_restructure';
    } else if (whTrend && whTrend.gte(shock) && volumeHigh) {
      seg = 'optimise_routing'; reasons.push(`Wholesale cost up ${fmt(whTrend)} bps vs 3-month baseline on above-median volume`);
    } else if (marginHigh) {
      if (volumeHigh || (growth !== null && growth.gte(0))) { seg = 'protect_grow'; reasons.push(`Unit margin ${fmt(unit)} bps ≥ portfolio ${fmt(pUnit)} bps`); }
      else { seg = 'monitor'; reasons.push(`Healthy margin (${fmt(unit)} bps) but low and shrinking volume`); }
    } else if (volumeHigh) {
      const whBps = bpsOf(m.wholesale, gpv);
      if (whMdr && pWhMdr && whBps && pWhBps && whMdr.gte(pWhMdr.plus(gap)) && whBps.gte(pWhBps)) { seg = 'optimise_routing'; reasons.push(`Wholesale ${fmt(whBps)} bps of GPV (portfolio ${fmt(pWhBps)}) absorbs ${fmt(whMdr.times(100))}% of MDR vs portfolio ${fmt(pWhMdr.times(100))}%`); }
      else { seg = 'reprice'; reasons.push(`Unit margin ${fmt(unit)} bps < portfolio ${fmt(pUnit)} bps on above-median volume`); }
    } else {
      const ratio = unit && pUnit && pUnit.gt(0) ? unit.div(pUnit) : null;
      if (ratio && ratio.lt('0.25') && m.commercialImportance <= 2) { seg = 'exit_restructure'; reasons.push(`Sub-scale with unit margin ${fmt(unit)} bps (< 25 % of portfolio)`); }
      else if (ratio && ratio.lt('0.5')) { seg = 'reprice'; reasons.push(`Unit margin ${fmt(unit)} bps (< 50 % of portfolio ${fmt(pUnit)} bps)`); }
      else { seg = 'monitor'; reasons.push(`Below-average margin (${fmt(unit)} bps) on low volume`); }
    }
    if (share && share.gte(conc)) flags.push(`Concentration ${fmt(share.times(100))}% of net revenue`);
    if (m.churnRisk >= 4) flags.push(`High churn risk (${m.churnRisk}/5)`);
    if (m.commercialImportance >= 4) flags.push(`Strategic (importance ${m.commercialImportance}/5)`);
    if (constraint) flags.push('Contractually constrained');
    if (growth !== null && growth.lt('-0.05')) flags.push(`Volume declining ${fmt(growth.times(100))}%`);
    const ut = m.trend?.unitMarginTrendBps ? dec(m.trend.unitMarginTrendBps) : null;
    if (ut && ut.lte(-5)) flags.push(`Margin erosion ${fmt(ut)} bps`);
    if (m.status === 'churned') flags.push('Churned');
    counts[seg]++;
    let action = SEGMENTS[seg].action;
    if ((seg === 'reprice' || seg === 'exit_restructure') && constraint) action = `Contractually constrained — do not reprice now. Prepare the case for the next contractual window (${constraint}).`;
    return {
      id: m.id, code: m.code, name: m.name, segment: seg, segmentLabel: SEGMENTS[seg].label, action, reasons, flags,
      gpv: gpv.toString(), netRevenue: net.toString(), contribution: cm.toString(),
      unitMarginBps: s(unit, 4), wholesaleToMdr: s(whMdr), revenueShare: s(share), growth: s(growth),
      volumeHigh, marginHigh, constrained: constraint !== null, constraint, commercialImportance: m.commercialImportance, churnRisk: m.churnRisk,
    };
  });
  return {
    rows, counts,
    thresholds: { portfolioUnitMarginBps: s(pUnit, 4), medianGpv: medGpv.toString(), portfolioWholesaleToMdr: s(pWhMdr), portfolioWholesaleBps: s(pWhBps, 4), concentrationThreshold: conc.toString(), routingGapThreshold: gap.toString(), wholesaleShockBps: shock.toString() },
  };
}

// ---------------------------------------------------------------------------
// Pricing opportunities
// ---------------------------------------------------------------------------
export interface PricingOpportunity {
  id: string; code: string; name: string; kind: 'reprice' | 'routing' | 'restructure';
  status: 'candidate' | 'constrained';
  recommendation: string; evidence: string[]; uncertainty: string[];
  suggestedMdrChangeBps: string | null;      // positive = price increase
  monthlyImpact: string | null;              // contribution impact per month before any churn
  breakEvenChurnProbability: string | null;  // churn probability at which the change destroys value
  constraint: string | null;
}

/** Round a positive bps figure up to the next multiple of `step`. */
export function ceilTo(x: Dec, step: number): Dec { return x.div(step).ceil().times(step); }

/**
 * Builds repricing / routing candidates from segmentation results. Contractually
 * constrained merchants are never recommended for immediate repricing.
 *   suggested MDR change = wholesale increase passed through (rounded up to 1 bp) when wholesale rose,
 *                          otherwise the gap to the portfolio unit margin rounded up to 5 bps, capped at 50 bps
 *   monthly impact       = average monthly GPV × suggested bps
 *   break-even churn p   = Δ / (monthly contribution + Δ): above this churn probability the change loses money
 */
export function pricingOpportunities(seg: SegmentationOutput, inputs: SegmentInput[], months: number): PricingOpportunity[] {
  const byId = new Map(inputs.map((m) => [m.id, m]));
  const pUnit = seg.thresholds.portfolioUnitMarginBps ? dec(seg.thresholds.portfolioUnitMarginBps) : null;
  const out: PricingOpportunity[] = [];
  const n = Math.max(1, months);
  for (const r of seg.rows) {
    const m = byId.get(r.id)!;
    const whTrend = m.trend?.wholesaleTrendBps ? dec(m.trend.wholesaleTrendBps) : null;
    const relevant = r.segment === 'reprice' || r.segment === 'optimise_routing' || r.segment === 'exit_restructure' || (whTrend !== null && whTrend.gte(5) && dec(r.gpv).gt(0));
    if (!relevant || dec(r.gpv).isZero()) continue;
    const unit = r.unitMarginBps ? dec(r.unitMarginBps) : null;
    const monthlyGpv = dec(r.gpv).div(n);
    const monthlyCm = dec(r.contribution).div(n);
    let bps: Dec | null = null;
    if (whTrend && whTrend.gt(0.5)) bps = whTrend.ceil();
    else if (unit && pUnit && pUnit.gt(unit)) { bps = ceilTo(pUnit.minus(unit), 5); if (bps.gt(50)) bps = dec(50); }
    const impact = bps ? monthlyGpv.times(bps).div(10000) : null;
    const beChurn = impact && monthlyCm.plus(impact).gt(0) ? impact.div(monthlyCm.plus(impact)) : null;
    const kind: PricingOpportunity['kind'] = r.segment === 'optimise_routing' ? 'routing' : r.segment === 'exit_restructure' ? 'restructure' : 'reprice';
    const evidence: string[] = [
      `Unit contribution margin ${unit ? unit.toFixed(1) : '—'} bps of GPV vs portfolio ${pUnit ? pUnit.toFixed(1) : '—'} bps`,
      `Wholesale absorbs ${r.wholesaleToMdr ? dec(r.wholesaleToMdr).times(100).toFixed(1) : '—'}% of MDR`,
    ];
    if (whTrend) evidence.push(`Wholesale ${whTrend.gte(0) ? '+' : ''}${whTrend.toFixed(1)} bps (latest month vs 3-month baseline)`);
    if (m.trend?.mdrTrendBps) evidence.push(`MDR ${dec(m.trend.mdrTrendBps).gte(0) ? '+' : ''}${dec(m.trend.mdrTrendBps).toFixed(1)} bps (same basis)`);
    evidence.push(...r.reasons);
    const uncertainty = [
      'Volume response to a price change is not estimated (no price-elasticity history) — use the simulation with churn probability.',
      `Churn risk score ${r.churnRisk}/5; commercial importance ${r.commercialImportance}/5.`,
    ];
    if (beChurn) uncertainty.push(`The change destroys value if churn probability exceeds ${beChurn.times(100).toFixed(1)}%.`);
    if (m.trend?.wholesaleTrendBps === null || !m.trend) uncertainty.push('Fewer than 4 months of history — trend not established.');
    const constrained = r.constrained;
    let recommendation: string;
    if (kind === 'routing') recommendation = `Review acquirer routing / fee schedule first${bps ? `; if not recoverable, pass through +${bps.toFixed(0)} bps` : ''}.`;
    else if (kind === 'restructure') recommendation = 'Introduce a minimum monthly fee or SaaS bundle, or plan an orderly exit.';
    else recommendation = bps ? `Consider MDR +${bps.toFixed(0)} bps (≈ +${bps.div(100).toFixed(2)} pp).` : 'Review pricing structure.';
    if (constrained) recommendation = `Contractually constrained — NOT recommended for immediate repricing. ${kind === 'routing' ? 'Routing changes may still be possible if they do not alter merchant price. ' : ''}Prepare for the next contractual window.`;
    out.push({ id: r.id, code: r.code, name: r.name, kind, status: constrained ? 'constrained' : 'candidate', recommendation, evidence, uncertainty, suggestedMdrChangeBps: bps ? bps.toString() : null, monthlyImpact: impact ? impact.toDecimalPlaces(2).toString() : null, breakEvenChurnProbability: s(beChurn), constraint: r.constraint });
  }
  return out.sort((a, b) => (a.status === b.status ? dec(b.monthlyImpact ?? 0).cmp(dec(a.monthlyImpact ?? 0)) : a.status === 'candidate' ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Contribution change decomposition
// ---------------------------------------------------------------------------
export interface ContributionBridge {
  from: string; to: string;
  contributionFrom: string; contributionTo: string; change: string;
  volume: string; mdrRate: string; wholesaleRate: string; processing: string; saas: string;
  check: string;    // change − Σ effects (always 0)
  gpvFrom: string; gpvTo: string;
  mdrBpsFrom: string | null; mdrBpsTo: string | null; wholesaleBpsFrom: string | null; wholesaleBpsTo: string | null;
}

/**
 * Contribution CM = MDR − wholesale − processing + SaaS. With G = GPV, m = MDR/G, w = wholesale/G:
 *   volume effect          (G1 − G0) × (m0 − w0)       — at the base month's net payment margin
 *   MDR rate effect        ΔMDR − (G1 − G0) × m0       = G1 × (m1 − m0)
 *   wholesale rate effect  −(ΔWH − (G1 − G0) × w0)     = −G1 × (w1 − w0)
 *   processing effect      −Δprocessing
 *   SaaS effect            ΔSaaS
 * Rate effects are computed as residuals so the five effects sum EXACTLY to ΔCM.
 * When the base month has no GPV, the whole payment margin change is volume.
 */
export function decomposeContribution(a: MonthEcon, b: MonthEcon): ContributionBridge {
  const G0 = dec(a.gpv), G1 = dec(b.gpv);
  const M0 = dec(a.mdr), M1 = dec(b.mdr), W0 = dec(a.wholesale), W1 = dec(b.wholesale);
  const P0 = dec(a.processing), P1 = dec(b.processing), S0 = dec(a.saas), S1 = dec(b.saas);
  const cm0 = M0.minus(W0).minus(P0).plus(S0), cm1 = M1.minus(W1).minus(P1).plus(S1);
  let mdrVol: Dec, whVol: Dec;
  if (G0.isZero()) { mdrVol = M1.minus(M0); whVol = W1.minus(W0); }
  else { const dG = G1.minus(G0); mdrVol = dG.times(M0).div(G0).toDecimalPlaces(4); whVol = dG.times(W0).div(G0).toDecimalPlaces(4); }
  const volume = mdrVol.minus(whVol);
  const mdrRate = M1.minus(M0).minus(mdrVol);
  const wholesaleRate = W1.minus(W0).minus(whVol).neg();
  const processing = P1.minus(P0).neg();
  const saas = S1.minus(S0);
  const change = cm1.minus(cm0);
  const check = change.minus(volume.plus(mdrRate).plus(wholesaleRate).plus(processing).plus(saas));
  return {
    from: a.month, to: b.month, contributionFrom: cm0.toString(), contributionTo: cm1.toString(), change: change.toString(),
    volume: volume.toString(), mdrRate: mdrRate.toString(), wholesaleRate: wholesaleRate.toString(), processing: processing.toString(), saas: saas.toString(), check: check.toString(),
    gpvFrom: G0.toString(), gpvTo: G1.toString(),
    mdrBpsFrom: s(bpsOf(M0, G0), 2), mdrBpsTo: s(bpsOf(M1, G1), 2), wholesaleBpsFrom: s(bpsOf(W0, G0), 2), wholesaleBpsTo: s(bpsOf(W1, G1), 2),
  };
}

/** Parse a user-entered decimal (form/GET). Returns null for empty, throws on garbage. */
export function parseDecimalInput(v: string | null | undefined, label: string, range?: { min?: DecLike; max?: DecLike }): Dec | null {
  if (v === null || v === undefined || v.trim() === '') return null;
  const t = v.trim().replace(/,/g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) throw new Error(`${label}: "${v}" is not a number`);
  const d = dec(t.replace(/^\+/, ''));
  if (range?.min !== undefined && d.lt(dec(range.min))) throw new Error(`${label} must be ≥ ${range.min}`);
  if (range?.max !== undefined && d.gt(dec(range.max))) throw new Error(`${label} must be ≤ ${range.max}`);
  return d;
}
