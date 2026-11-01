import { describe, it, expect } from 'vitest';
import { computeTxnEconomics, type PricingRule, type FeeRule, type ProcessingRule } from '@/lib/engine/fees';

const pricing: PricingRule[] = [
  { id: 'p-all', merchant_id: 'm1', payment_method_id: null, card_region: 'any', mdr_bps: '200', fixed_fee: '0', effective_from: '2025-01-01', effective_to: null },
  { id: 'p-visa-intl', merchant_id: 'm1', payment_method_id: 'visa', card_region: 'international', mdr_bps: '275', fixed_fee: '1', effective_from: '2025-01-01', effective_to: '2026-10-31' },
  { id: 'p-visa-intl-new', merchant_id: 'm1', payment_method_id: 'visa', card_region: 'international', mdr_bps: '300', fixed_fee: '1', effective_from: '2026-11-01', effective_to: null },
];
const fees: FeeRule[] = [
  { id: 'f-old', acquirer_id: 'sbm', payment_method_id: null, card_region: 'international', wholesale_bps: '160', fixed_fee: '0', effective_from: '2025-01-01', effective_to: '2026-08-31' },
  { id: 'f-new', acquirer_id: 'sbm', payment_method_id: null, card_region: 'international', wholesale_bps: '195', fixed_fee: '0', effective_from: '2026-09-01', effective_to: null },
  { id: 'f-dom', acquirer_id: 'sbm', payment_method_id: null, card_region: 'any', wholesale_bps: '110', fixed_fee: '0', effective_from: '2025-01-01', effective_to: null },
];
const proc: ProcessingRule[] = [{ product_id: null, cost_per_txn: '2.5', cost_bps: '5', effective_from: '2025-01-01', effective_to: null }];
const base = { merchant_id: 'm1', acquirer_id: 'sbm', payment_method_id: 'visa', product_id: 'ecom', status: 'success', amount_base: '10000' };

describe('fee engine', () => {
  it('picks the most specific effective pricing agreement', () => {
    const e = computeTxnEconomics({ ...base, card_region: 'international', accounting_date: '2026-06-15' }, pricing, fees, proc);
    expect(e.pricingId).toBe('p-visa-intl');
    expect(e.mdr.toString()).toBe('276'); // 10 000 × 2.75 % + 1
  });
  it('honours effective dating of wholesale fee schedules (Sep 2026 increase)', () => {
    const before = computeTxnEconomics({ ...base, card_region: 'international', accounting_date: '2026-08-31' }, pricing, fees, proc);
    const after = computeTxnEconomics({ ...base, card_region: 'international', accounting_date: '2026-09-01' }, pricing, fees, proc);
    expect(before.wholesale.toString()).toBe('160');
    expect(after.wholesale.toString()).toBe('195');
    expect(after.feeScheduleId).toBe('f-new');
  });
  it('falls back to the generic agreement and region-any schedule', () => {
    const e = computeTxnEconomics({ ...base, payment_method_id: 'mc', card_region: 'domestic', accounting_date: '2026-06-15' }, pricing, fees, proc);
    expect(e.pricingId).toBe('p-all');
    expect(e.mdr.toString()).toBe('200');
    expect(e.feeScheduleId).toBe('f-dom');
  });
  it('failed transactions earn no MDR but incur per-attempt processing cost', () => {
    const e = computeTxnEconomics({ ...base, status: 'failed', card_region: 'domestic', accounting_date: '2026-06-15' }, pricing, fees, proc);
    expect(e.mdr.isZero()).toBe(true);
    expect(e.wholesale.isZero()).toBe(true);
    expect(e.processing.toString()).toBe('2.5');
  });
  it('flags missing pricing instead of inventing a fee', () => {
    const e = computeTxnEconomics({ ...base, merchant_id: 'unknown', card_region: 'domestic', accounting_date: '2026-06-15' }, pricing, fees, proc);
    expect(e.issues).toContain('NO_PRICING_AGREEMENT');
    expect(e.mdr.isZero()).toBe(true);
  });
});
