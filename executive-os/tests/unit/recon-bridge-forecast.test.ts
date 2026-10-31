import { describe, it, expect } from 'vitest';
import { reconcile } from '@/lib/engine/reconcile';
import { revenueBridge, concentration } from '@/lib/engine/bridge';
import { forecast13w, DEFAULT_SCENARIOS, collectionDelaySensitivity } from '@/lib/engine/cashforecast';
import { bucketFor, dso, agingSummary } from '@/lib/engine/aging';

describe('reconciliation matcher', () => {
  const bank = [
    { id: 'b1', date: '2026-10-02', amount: '15000', reference: 'INV-1001' },
    { id: 'b2', date: '2026-10-03', amount: '-4200.50', reference: '' , description: 'AWS'},
    { id: 'b3', date: '2026-10-05', amount: '3000', reference: 'SET-77' },
    { id: 'b4', date: '2026-10-05', amount: '2000', reference: 'SET-77' },
    { id: 'b5', date: '2026-10-09', amount: '9999', reference: 'INV-1002' },
    { id: 'b6', date: '2026-10-09', amount: '9999', reference: 'INV-1002' },   // duplicate statement line
    { id: 'b7', date: '2026-10-20', amount: '-125.00', reference: 'CHG' },
    { id: 'b8', date: '2026-10-21', amount: '12000', reference: 'BATCH-9' },
  ];
  const ledger = [
    { id: 'l1', date: '2026-10-01', amount: '15000', reference: 'INV-1001' },
    { id: 'l2', date: '2026-10-04', amount: '-4200.50', reference: 'AWS-OCT' },
    { id: 'l3', date: '2026-10-05', amount: '5000', reference: 'SET-77' },
    { id: 'l4', date: '2026-10-09', amount: '10000', reference: 'INV-1002' },
    { id: 'l5', date: '2026-10-21', amount: '7000', reference: 'BATCH-9' },
    { id: 'l6', date: '2026-10-21', amount: '5000', reference: 'BATCH-9' },
  ];
  const r = reconcile(bank, ledger);
  it('matches 1:1 by reference, 1:1 by amount/date, many:1 and 1:many', () => {
    const byRule = r.matches.map((m) => `${m.cardinality}:${m.bankIds.join('+')}=${m.ledgerIds.join('+')}`);
    expect(byRule).toContain('one_to_one:b1=l1');
    expect(byRule).toContain('one_to_one:b2=l2');
    expect(byRule).toContain('many_to_one:b3+b4=l3');
    expect(byRule).toContain('one_to_many:b8=l5+l6');
    expect(r.matches.every((m) => m.difference.isZero())).toBe(true);
  });
  it('detects duplicates and amount differences without writing them off', () => {
    expect(r.exceptions.find((e) => e.kind === 'duplicate')?.itemId).toBe('b6');
    const diff = r.exceptions.find((e) => e.kind === 'amount_difference' && e.side === 'bank');
    expect(diff?.difference?.toString()).toBe('-1');
    expect(r.exceptions.find((e) => e.itemId === 'b7')?.kind).toBe('unmatched');
    expect(r.unresolvedDifference.toString()).toBe('-126'); // (9999 − 125) − 10 000
  });
});

describe('revenue bridge', () => {
  it('decomposes revenue change exactly and separates volume from rate', () => {
    const a = { m1: { gpv: '1000000', txnRevenue: '7000', otherRevenue: '500', successes: '500' }, m2: { gpv: '500000', txnRevenue: '4000', otherRevenue: '0', successes: '250' } };
    const b = { m1: { gpv: '1200000', txnRevenue: '7200', otherRevenue: '500', successes: '550' }, m3: { gpv: '300000', txnRevenue: '2400', otherRevenue: '0', successes: '100' } };
    const r = revenueBridge(a, b);
    expect(r.check.isZero()).toBe(true);
    expect(r.newMerchants.toString()).toBe('2400');
    expect(r.lostMerchants.toString()).toBe('-4000');
    expect(r.volumeEffect.toString()).toBe('1400');    // +200k × 0.70 %
    expect(r.rateEffect.toString()).toBe('-1200');     // −10 bps on 1.2m: volume up, revenue barely up
    expect(r.txnCountEffect.plus(r.avgTicketEffect).toString()).toBe(r.volumeEffect.toString());
  });
  it('concentration index', () => {
    const c = concentration(['50', '30', '20']);
    expect(c.hhi!.toString()).toBe('3800');
    expect(c.top1Share!.toString()).toBe('0.5');
  });
});

describe('13-week cash forecast', () => {
  const p = {
    startWeek: '2026-11-02', openingCash: '1000000', minimumLiquidity: '600000',
    receivables: [{ id: 'i1', dueDate: '2026-11-10', outstanding: '200000', disputed: false }, { id: 'i2', dueDate: '2026-10-01', outstanding: '50000', disputed: true }],
    payables: [{ id: 's1', dueDate: '2026-11-20', amount: '150000', status: 'approved', priority: 'normal' }],
    items: [{ category: 'payroll' as const, description: 'Payroll', amount: '-300000', recurrence: 'monthly' as const, startDate: '2026-01-25', dayOfMonth: 25 }],
    scenario: DEFAULT_SCENARIOS[0],
  };
  it('produces 13 weeks with consistent opening/closing balances', () => {
    const r = forecast13w(p);
    expect(r.weeks).toHaveLength(13);
    for (let i = 1; i < 13; i++) expect(r.weeks[i].opening.eq(r.weeks[i - 1].closing)).toBe(true);
    // payroll ×3 (Nov, Dec, Jan) + supplier; receipts base: 200k×97 % + 50k×50 %
    expect(r.weeks[12].closing.toString()).toBe('169000'); // 1 000 000 + 194 000 + 25 000 − 150 000 − 900 000
  });
  it('pessimistic scenario and delay sensitivity reduce minimum cash', () => {
    const base = forecast13w(p); const pess = forecast13w({ ...p, scenario: DEFAULT_SCENARIOS[2] });
    expect(pess.minClosing.lt(base.minClosing)).toBe(true);
    const sens = collectionDelaySensitivity(p);
    expect(sens[0].minClosing.gte(sens[sens.length - 1].minClosing)).toBe(true);
  });
});

describe('AR aging', () => {
  it('buckets by days overdue and computes DSO', () => {
    expect(bucketFor('2026-10-31', '2026-10-31')).toBe('current');
    expect(bucketFor('2026-10-01', '2026-10-31')).toBe('1_30');
    expect(bucketFor('2026-08-01', '2026-10-31')).toBe('over_90');
    const s = agingSummary([{ dueDate: '2026-09-15', outstanding: '100' }, { dueDate: '2026-11-15', outstanding: '50' }], '2026-10-31');
    expect(s['31_60'].toString()).toBe('100');
    expect(s.current.toString()).toBe('50');
    expect(dso('300000', '900000', 30)!.toString()).toBe('10');
  });
});
