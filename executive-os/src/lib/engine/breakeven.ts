/**
 * Break-even engine (monthly basis).
 * Accounting break-even: fixed costs include depreciation & amortisation.
 * Operating-cash break-even: excludes non-cash D&A, adds cash-only fixed outflows
 * (loan repayments, maintenance capex) supplied by the user.
 */
import { applyBps, dec, safeDiv, ONE, ZERO, type Dec, type DecLike } from '../money';

export interface BreakEvenInput {
  gpv: DecLike; successes: DecLike; activeMerchants: DecLike;
  mdr: DecLike; wholesale: DecLike; processing: DecLike; saas: DecLike;
  fixedCosts: DecLike;      // monthly fixed operating costs incl. D&A
  depreciation: DecLike;    // monthly D&A included in fixedCosts
  cashOnlyFixed?: DecLike;  // monthly loan repayments / capex not in P&L
}
export interface BreakEvenSim {
  mdrChangeBps?: DecLike; wholesaleChangeBps?: DecLike; txnGrowthPct?: DecLike;
  newStaffMonthly?: DecLike; infraMonthly?: DecLike; mixTakeRateDeltaBps?: DecLike;
}
export interface BreakEvenResult {
  gpv: Dec; successes: Dec; netRevenue: Dec; contribution: Dec; contributionRatio: Dec | null;
  fixedCosts: Dec; cashFixedCosts: Dec; operatingProfit: Dec; operatingCashProfit: Dec;
  contributionPerTxn: Dec | null; contributionPerGpvBps: Dec | null;
  breakEvenRevenue: Dec | null; breakEvenGpv: Dec | null; breakEvenTxns: Dec | null;
  requiredTakeRateBps: Dec | null; requiredMerchants: Dec | null;
  cashBreakEvenRevenue: Dec | null; cashBreakEvenGpv: Dec | null;
  marginOfSafety: Dec | null;
}

export function breakEven(i: BreakEvenInput, s: BreakEvenSim = {}): BreakEvenResult {
  const g = ONE.plus(dec(s.txnGrowthPct ?? 0));
  const gpv = dec(i.gpv).times(g), successes = dec(i.successes).times(g);
  const mdr = dec(i.mdr).times(g).plus(applyBps(gpv, s.mdrChangeBps ?? 0)).plus(applyBps(gpv, s.mixTakeRateDeltaBps ?? 0));
  const wholesale = dec(i.wholesale).times(g).plus(applyBps(gpv, s.wholesaleChangeBps ?? 0));
  const processing = dec(i.processing).times(g);
  const saas = dec(i.saas);
  const netRevenue = mdr.minus(wholesale).plus(saas);
  const contribution = netRevenue.minus(processing);
  const fixed = dec(i.fixedCosts).plus(dec(s.newStaffMonthly ?? 0)).plus(dec(s.infraMonthly ?? 0));
  const cashFixed = fixed.minus(dec(i.depreciation)).plus(dec(i.cashOnlyFixed ?? 0));
  const cr = safeDiv(contribution, netRevenue);
  // Variable contribution excludes SaaS (treated as fixed recurring income offsetting fixed costs)
  const varContribution = contribution.minus(saas);
  const perGpv = safeDiv(varContribution, gpv);
  const perTxn = safeDiv(varContribution, successes);
  const need = fixed.minus(saas), needCash = cashFixed.minus(saas);
  const pos = (x: Dec | null) => (x && x.gt(0) ? x : null);
  const beGpv = pos(perGpv) ? (need.lte(0) ? ZERO : need.div(perGpv!)) : null;
  const beGpvCash = pos(perGpv) ? (needCash.lte(0) ? ZERO : needCash.div(perGpv!)) : null;
  const revPerGpv = safeDiv(netRevenue.minus(saas), gpv);
  const avgGpvPerMerchant = safeDiv(dec(i.gpv), i.activeMerchants);
  return {
    gpv, successes, netRevenue, contribution, contributionRatio: cr,
    fixedCosts: fixed, cashFixedCosts: cashFixed,
    operatingProfit: contribution.minus(fixed), operatingCashProfit: contribution.minus(cashFixed),
    contributionPerTxn: perTxn, contributionPerGpvBps: perGpv ? perGpv.times(10000) : null,
    breakEvenRevenue: beGpv && revPerGpv ? beGpv.times(revPerGpv).plus(saas) : null,
    breakEvenGpv: beGpv,
    breakEvenTxns: pos(perTxn) ? (need.lte(0) ? ZERO : need.div(perTxn!)) : null,
    requiredTakeRateBps: gpv.isZero() ? null : fixed.plus(processing).minus(saas).div(gpv).times(10000),
    requiredMerchants: beGpv && avgGpvPerMerchant ? beGpv.div(avgGpvPerMerchant).ceil() : null,
    cashBreakEvenRevenue: beGpvCash && revPerGpv ? beGpvCash.times(revPerGpv).plus(saas) : null,
    cashBreakEvenGpv: beGpvCash,
    marginOfSafety: beGpv ? safeDiv(gpv.minus(beGpv), gpv) : null,
  };
}
