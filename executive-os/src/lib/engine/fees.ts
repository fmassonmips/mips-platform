/**
 * Fee engine — resolves effective-dated pricing agreements (merchant MDR) and
 * acquirer fee schedules (wholesale cost), then computes per-transaction economics.
 *
 * Rules (FEE-ENGINE v1):
 *  - Only `success` transactions earn MDR and incur wholesale fees.
 *  - Every attempt (success or failed) incurs the direct processing cost.
 *  - Specificity: payment-method match beats "all methods"; region match beats "any";
 *    then the latest effective_from wins.
 *  - effective_to is inclusive. Fixed fees are expressed in the tenant base currency.
 */
import { applyBps, dec, ZERO, type Dec } from '../money';

export interface PricingRule { id: string; merchant_id: string; payment_method_id: string | null; card_region: string; mdr_bps: string; fixed_fee: string; effective_from: string; effective_to: string | null }
export interface FeeRule { id: string; acquirer_id: string; payment_method_id: string | null; card_region: string; wholesale_bps: string; fixed_fee: string; effective_from: string; effective_to: string | null }
export interface ProcessingRule { product_id: string | null; cost_per_txn: string; cost_bps: string; effective_from: string; effective_to: string | null }

export interface TxnInput { merchant_id: string; acquirer_id: string | null; payment_method_id: string; product_id: string; card_region: string; status: string; amount_base: Dec | string; accounting_date: string }

function active(r: { effective_from: string; effective_to: string | null }, date: string) {
  return r.effective_from <= date && (r.effective_to === null || r.effective_to >= date);
}

function score(r: { payment_method_id: string | null; card_region: string }, pm: string, region: string): number {
  return (r.payment_method_id === pm ? 2 : 0) + (r.card_region === region ? 1 : 0);
}

function pick<T extends { payment_method_id: string | null; card_region: string; effective_from: string; effective_to: string | null }>(rules: T[], pm: string, region: string, date: string): T | null {
  let best: T | null = null; let bestScore = -1;
  for (const r of rules) {
    if (!active(r, date)) continue;
    if (r.payment_method_id !== null && r.payment_method_id !== pm) continue;
    if (r.card_region !== 'any' && r.card_region !== region) continue;
    const s = score(r, pm, region);
    if (s > bestScore || (s === bestScore && best && r.effective_from > best.effective_from)) { best = r; bestScore = s; }
  }
  return best;
}

export function resolvePricing(rules: PricingRule[], t: TxnInput): PricingRule | null {
  return pick(rules.filter((r) => r.merchant_id === t.merchant_id), t.payment_method_id, t.card_region, t.accounting_date);
}
export function resolveFeeSchedule(rules: FeeRule[], t: TxnInput): FeeRule | null {
  if (!t.acquirer_id) return null;
  return pick(rules.filter((r) => r.acquirer_id === t.acquirer_id), t.payment_method_id, t.card_region, t.accounting_date);
}
export function resolveProcessing(rules: ProcessingRule[], t: TxnInput): ProcessingRule | null {
  const act = rules.filter((r) => active(r, t.accounting_date));
  return act.find((r) => r.product_id === t.product_id) ?? act.find((r) => r.product_id === null) ?? null;
}

export interface TxnEconomics { mdr: Dec; wholesale: Dec; processing: Dec; pricingId: string | null; feeScheduleId: string | null; issues: string[] }

export function computeTxnEconomics(t: TxnInput, pricing: PricingRule[], fees: FeeRule[], processing: ProcessingRule[]): TxnEconomics {
  const issues: string[] = [];
  const amt = dec(t.amount_base);
  const p = resolvePricing(pricing, t);
  const f = resolveFeeSchedule(fees, t);
  const pr = resolveProcessing(processing, t);
  const success = t.status === 'success';
  if (success && !p) issues.push('NO_PRICING_AGREEMENT');
  if (success && t.acquirer_id && !f) issues.push('NO_FEE_SCHEDULE');
  const mdr = success && p ? applyBps(amt, p.mdr_bps).plus(dec(p.fixed_fee)) : ZERO;
  const wholesale = success && f ? applyBps(amt, f.wholesale_bps).plus(dec(f.fixed_fee)) : ZERO;
  const processingCost = pr ? dec(pr.cost_per_txn).plus(success ? applyBps(amt, pr.cost_bps) : ZERO) : ZERO;
  return { mdr, wholesale, processing: processingCost, pricingId: p?.id ?? null, feeScheduleId: f?.id ?? null, issues };
}
