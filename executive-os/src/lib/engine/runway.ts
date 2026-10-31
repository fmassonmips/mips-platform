/**
 * Liquidity & runway. Restricted / safeguarded / merchant funds are excluded.
 * If average net operating cash flow is >= 0 the business is cash-generative and
 * NO finite runway is reported (runwayMonths = null, status 'cash_generative').
 */
import { dec, safeDiv, sum, ZERO, type Dec, type DecLike } from '../money';

export interface RunwayInput {
  unrestrictedCash: DecLike; restrictedCash: DecLike;
  monthlyNetCashFlows: DecLike[];   // historical operating net cash flow per month (oldest first)
  minimumLiquidity: DecLike;        // board/regulatory floor
}
export interface RunwayResult {
  unrestrictedCash: Dec; restrictedCash: Dec; avgMonthlyNetFlow: Dec; monthlyBurn: Dec | null;
  status: 'cash_generative' | 'burning' | 'below_minimum';
  runwayMonths: Dec | null; runwayToMinimumMonths: Dec | null; headroom: Dec;
}

export function runway(i: RunwayInput): RunwayResult {
  const cash = dec(i.unrestrictedCash);
  const flows = i.monthlyNetCashFlows.map(dec);
  const avg = flows.length ? sum(flows).div(flows.length) : ZERO;
  const minL = dec(i.minimumLiquidity);
  const headroom = cash.minus(minL);
  if (headroom.lt(0)) return { unrestrictedCash: cash, restrictedCash: dec(i.restrictedCash), avgMonthlyNetFlow: avg, monthlyBurn: avg.lt(0) ? avg.neg() : null, status: 'below_minimum', runwayMonths: avg.lt(0) ? safeDiv(cash, avg.neg()) : null, runwayToMinimumMonths: ZERO, headroom };
  if (avg.gte(0)) return { unrestrictedCash: cash, restrictedCash: dec(i.restrictedCash), avgMonthlyNetFlow: avg, monthlyBurn: null, status: 'cash_generative', runwayMonths: null, runwayToMinimumMonths: null, headroom };
  const burn = avg.neg();
  return { unrestrictedCash: cash, restrictedCash: dec(i.restrictedCash), avgMonthlyNetFlow: avg, monthlyBurn: burn, status: 'burning', runwayMonths: safeDiv(cash, burn), runwayToMinimumMonths: safeDiv(headroom, burn), headroom };
}

export interface StressShock { key: string; label: string; revenueShockPct?: DecLike; costShockMonthly?: DecLike; collectionDelayDays?: DecLike; oneOffOutflow?: DecLike; }
export const STANDARD_STRESS_TESTS: StressShock[] = [
  { key: 'major_merchant_loss', label: 'Loss of largest merchant (contribution removed)' },
  { key: 'acquirer_disruption', label: 'Acquirer disruption: 30 % of volume unavailable for 1 month', revenueShockPct: '-0.30' },
  { key: 'margin_compression', label: 'Margin compression: −15 bps take rate' },
  { key: 'collection_delay', label: 'Collections delayed by 30 days', collectionDelayDays: 30 },
  { key: 'infra_cost', label: 'Infrastructure costs +25 %' },
  { key: 'regulatory', label: 'Unexpected regulatory expenditure (one-off)' },
];

/** Project month-end unrestricted cash for `months` under a monthly base flow plus shocks. */
export function projectCash(startCash: DecLike, baseMonthlyFlow: DecLike, months: number, monthlyShock: DecLike = 0, oneOff: DecLike = 0, oneOffMonth = 1): Dec[] {
  let c = dec(startCash); const out: Dec[] = [];
  for (let m = 1; m <= months; m++) {
    c = c.plus(dec(baseMonthlyFlow)).plus(dec(monthlyShock));
    if (m === oneOffMonth) c = c.minus(dec(oneOff));
    out.push(c);
  }
  return out;
}
