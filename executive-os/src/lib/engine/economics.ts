/**
 * Payment economics — the core separation between money processed for merchants
 * and money that is MIPS revenue.
 *
 *   GPV (gross payment value)       funds processed on behalf of merchants — NEVER revenue
 *   Gross acquiring fees (MDR)      charged to merchants
 *   Wholesale cost                  paid to acquirers/schemes
 *   Net payment revenue             MDR − wholesale
 *   Recognised revenue              policy dependent (agent_net | principal_gross)
 *   Contribution margin             MDR − wholesale − direct processing − other direct + SaaS
 *                                   (identical under both policies)
 */
import { dec, safeDiv, sum, ZERO, type Dec, type DecLike } from '../money';

export type RevenuePolicy = 'agent_net' | 'principal_gross';

export interface EconomicsInput {
  gpv: DecLike;            // successful gross payment value (base ccy)
  mdr: DecLike;            // gross acquiring fees charged
  wholesale: DecLike;      // wholesale acquiring/processing cost
  processing: DecLike;     // direct processing cost
  saas: DecLike;           // subscription / value-added service revenue
  otherDirect?: DecLike;   // other attributable direct costs
  attempts: number | string;
  successes: number | string;
}

export interface Economics {
  gpv: Dec; grossFees: Dec; wholesale: Dec; processing: Dec; saas: Dec; otherDirect: Dec;
  netPaymentRevenue: Dec; recognisedRevenue: Dec; costOfSales: Dec; grossProfit: Dec;
  contributionMargin: Dec; contributionMarginPct: Dec | null;
  effectiveMdr: Dec | null; effectiveTakeRate: Dec | null; wholesaleRate: Dec | null;
  revenuePerTxn: Dec | null; costPerTxn: Dec | null; avgTicket: Dec | null; successRate: Dec | null;
  attempts: Dec; successes: Dec;
}

export function economics(i: EconomicsInput, policy: RevenuePolicy): Economics {
  const gpv = dec(i.gpv), grossFees = dec(i.mdr), wholesale = dec(i.wholesale), processing = dec(i.processing);
  const saas = dec(i.saas), otherDirect = dec(i.otherDirect ?? 0);
  const attempts = dec(i.attempts), successes = dec(i.successes);
  const netPaymentRevenue = grossFees.minus(wholesale);
  const recognisedRevenue = policy === 'agent_net' ? netPaymentRevenue.plus(saas) : grossFees.plus(saas);
  const costOfSales = policy === 'agent_net' ? processing.plus(otherDirect) : wholesale.plus(processing).plus(otherDirect);
  const grossProfit = recognisedRevenue.minus(costOfSales);
  const contributionMargin = grossFees.minus(wholesale).minus(processing).minus(otherDirect).plus(saas);
  return {
    gpv, grossFees, wholesale, processing, saas, otherDirect,
    netPaymentRevenue, recognisedRevenue, costOfSales, grossProfit, contributionMargin,
    contributionMarginPct: safeDiv(contributionMargin, recognisedRevenue),
    effectiveMdr: safeDiv(grossFees, gpv),
    effectiveTakeRate: safeDiv(netPaymentRevenue, gpv),
    wholesaleRate: safeDiv(wholesale, gpv),
    revenuePerTxn: safeDiv(recognisedRevenue, successes),
    costPerTxn: safeDiv(processing.plus(wholesale), successes),
    avgTicket: safeDiv(gpv, successes),
    successRate: safeDiv(successes, attempts),
    attempts, successes,
  };
}

export type AllocationMethod = 'by_revenue' | 'by_transactions' | 'by_gpv' | 'none';

/**
 * Allocate an overhead pool across units in proportion to a driver.
 * Rounding residual is assigned to the largest unit so the allocation sums exactly.
 */
export function allocate<K extends string>(pool: DecLike, drivers: Record<K, DecLike>, dp = 4): Record<K, Dec> {
  const p = dec(pool);
  const keys = Object.keys(drivers) as K[];
  const total = sum(keys.map((k) => drivers[k]));
  const out = {} as Record<K, Dec>;
  if (keys.length === 0) return out;
  if (total.isZero()) { for (const k of keys) out[k] = ZERO; return out; }
  let allocated = ZERO; let largest = keys[0];
  for (const k of keys) {
    const share = p.times(dec(drivers[k])).div(total).toDecimalPlaces(dp);
    out[k] = share; allocated = allocated.plus(share);
    if (dec(drivers[k]).gt(dec(drivers[largest]))) largest = k;
  }
  out[largest] = out[largest].plus(p.minus(allocated));
  return out;
}
