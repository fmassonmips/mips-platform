/**
 * Pricing simulation for merchant profitability.
 *
 * IMPORTANT unit convention: all rate changes are in BASIS POINTS.
 *   −20 bps on an MDR of 1.95 % gives 1.75 % (a 0.20 percentage-point reduction),
 *   NOT 1.95 % × (1 − 20 %).
 */
import { applyBps, dec, safeDiv, ONE, type Dec, type DecLike } from '../money';

export interface PricingBase {
  gpv: DecLike; successes: DecLike; mdr: DecLike; wholesale: DecLike; processing: DecLike; saas: DecLike;
}

export interface PricingChange {
  mdrChangeBps?: DecLike;          // negative = price reduction
  wholesaleChangeBps?: DecLike;    // change in acquirer cost
  volumeGrowthPct?: DecLike;       // fraction: 0.10 = +10 % volume (txn count & GPV scale together)
  migrateShare?: DecLike;          // fraction of GPV migrated to another acquirer
  migrateWholesaleDeltaBps?: DecLike; // wholesale difference on migrated volume (target − current)
  churnProbability?: DecLike;      // probability the merchant leaves (expected-value weighting)
}

export interface PricingResult {
  gpv: Dec; mdr: Dec; wholesale: Dec; processing: Dec; saas: Dec;
  netRevenue: Dec; contribution: Dec;
  effectiveMdrBps: Dec | null; effectiveWholesaleBps: Dec | null; takeRateBps: Dec | null;
}

function result(gpv: Dec, mdr: Dec, wholesale: Dec, processing: Dec, saas: Dec): PricingResult {
  const net = mdr.minus(wholesale);
  const bps = (x: Dec) => { const r = safeDiv(x, gpv); return r ? r.times(10000) : null; };
  return { gpv, mdr, wholesale, processing, saas, netRevenue: net.plus(saas), contribution: net.minus(processing).plus(saas), effectiveMdrBps: bps(mdr), effectiveWholesaleBps: bps(wholesale), takeRateBps: bps(net) };
}

export function baseResult(b: PricingBase): PricingResult {
  return result(dec(b.gpv), dec(b.mdr), dec(b.wholesale), dec(b.processing), dec(b.saas));
}

export function simulatePricing(b: PricingBase, c: PricingChange): PricingResult {
  const growth = ONE.plus(dec(c.volumeGrowthPct ?? 0));
  const gpv = dec(b.gpv).times(growth);
  // Scale existing economics with volume, then apply bps deltas on the new GPV.
  let mdr = dec(b.mdr).times(growth).plus(applyBps(gpv, c.mdrChangeBps ?? 0));
  let wholesale = dec(b.wholesale).times(growth).plus(applyBps(gpv, c.wholesaleChangeBps ?? 0));
  if (c.migrateShare) wholesale = wholesale.plus(applyBps(gpv.times(dec(c.migrateShare)), c.migrateWholesaleDeltaBps ?? 0));
  let processing = dec(b.processing).times(growth);
  let saas = dec(b.saas);
  if (mdr.isNegative()) mdr = dec(0);
  const keep = ONE.minus(dec(c.churnProbability ?? 0));
  if (!keep.eq(ONE)) {
    return result(gpv.times(keep), mdr.times(keep), wholesale.times(keep), processing.times(keep), saas.times(keep));
  }
  return result(gpv, mdr, wholesale, processing, saas);
}

/** Standard repricing ladder required by the specification. */
export const STANDARD_MDR_STEPS_BPS = [-5, -10, -20, -30] as const;

export function pricingLadder(b: PricingBase, extra: PricingChange = {}) {
  const base = baseResult(b);
  return STANDARD_MDR_STEPS_BPS.map((bps) => {
    const r = simulatePricing(b, { ...extra, mdrChangeBps: bps });
    return { changeBps: bps, result: r, deltaRevenue: r.netRevenue.minus(base.netRevenue), deltaContribution: r.contribution.minus(base.contribution) };
  });
}

/**
 * Volume growth needed to keep contribution unchanged after an MDR change.
 * Returns null when the change makes per-unit contribution non-positive.
 */
export function breakEvenVolumeForPriceChange(b: PricingBase, mdrChangeBps: DecLike): Dec | null {
  const base = baseResult(b);
  const gpv = dec(b.gpv);
  if (gpv.isZero()) return null;
  const unitContribution = dec(b.mdr).minus(dec(b.wholesale)).minus(dec(b.processing)).div(gpv).plus(dec(mdrChangeBps).div(10000));
  if (unitContribution.lte(0)) return null;
  const requiredGpv = base.contribution.minus(dec(b.saas)).div(unitContribution);
  return requiredGpv.div(gpv).minus(ONE);
}
