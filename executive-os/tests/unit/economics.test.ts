import { describe, it, expect } from 'vitest';
import { economics, allocate } from '@/lib/engine/economics';
import { sum } from '@/lib/money';

const input = { gpv: '1000000', mdr: '20000', wholesale: '13000', processing: '1500', saas: '2500', attempts: 520, successes: 500 };

describe('payment economics', () => {
  it('never treats GPV as revenue (agent / net policy)', () => {
    const e = economics(input, 'agent_net');
    expect(e.recognisedRevenue.toString()).toBe('9500');   // 20 000 − 13 000 + 2 500
    expect(e.gpv.toString()).toBe('1000000');
    expect(e.recognisedRevenue.lt(e.gpv)).toBe(true);
  });
  it('principal / gross policy recognises MDR as revenue and wholesale as cost of sales', () => {
    const e = economics(input, 'principal_gross');
    expect(e.recognisedRevenue.toString()).toBe('22500');
    expect(e.costOfSales.toString()).toBe('14500');
  });
  it('contribution margin is identical under both policies', () => {
    expect(economics(input, 'agent_net').contributionMargin.toString()).toBe('8000');
    expect(economics(input, 'principal_gross').contributionMargin.toString()).toBe('8000');
  });
  it('computes rates', () => {
    const e = economics(input, 'agent_net');
    expect(e.effectiveMdr!.toString()).toBe('0.02');
    expect(e.effectiveTakeRate!.toString()).toBe('0.007');
    expect(e.avgTicket!.toString()).toBe('2000');
    expect(e.successRate!.toFixed(4)).toBe('0.9615');
  });
  it('allocation sums exactly to the pool', () => {
    const a = allocate('1000', { a: '1', b: '1', c: '1' });
    expect(sum(Object.values(a)).toString()).toBe('1000');
    const z = allocate('500', { a: '0', b: '0' });
    expect(z.a.isZero() && z.b.isZero()).toBe(true);
  });
});
