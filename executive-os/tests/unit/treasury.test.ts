import { describe, it, expect } from 'vitest';
import {
  nextMondayAfter, cardinalityOf, matchSignature, validateManualMatch, reconBalances, planAutoMatch, policyFor, renderTemplate,
  monthsToBreach, runStressTests, weekBuckets, matchSupplierPayments, scenariosFromParams, safeReturnTo, readableError, UserError,
} from '@/lib/services/treasury';
import { DEFAULT_SCENARIOS } from '@/lib/engine/cashforecast';

describe('dates & routing helpers', () => {
  it('next Monday strictly after the period end', () => {
    expect(nextMondayAfter('2026-10-31')).toBe('2026-11-02');
    expect(nextMondayAfter('2026-11-02')).toBe('2026-11-09');
    expect(nextMondayAfter('2026-11-01')).toBe('2026-11-02');
  });
  it('safeReturnTo only allows treasury routes and strips flash params', () => {
    expect(safeReturnTo('/cash-flow/reconciliation/MCB-OPS/2026-10?ok=x&a=1', '/x')).toBe('/cash-flow/reconciliation/MCB-OPS/2026-10?a=1');
    expect(safeReturnTo('https://evil.example/', '/suppliers')).toBe('/suppliers');
    expect(safeReturnTo('//evil.example', '/suppliers')).toBe('/suppliers');
    expect(safeReturnTo('/admin', '/receivables')).toBe('/receivables');
  });
  it('maps DB segregation-of-duties CHECK violations to readable messages', () => {
    expect(readableError({ code: '23514', constraint: 'reconciliations_check' })).toMatch(/preparer .* cannot approve/);
    expect(readableError({ code: '23514', constraint: 'supplier_invoices_check' })).toMatch(/submitted .* cannot approve/);
    expect(readableError({ code: '23514', constraint: 'collection_events_check' })).toMatch(/drafted/);
    expect(readableError(new UserError('x'))).toBe('x');
    expect(readableError(new Error('internal secret'))).not.toMatch(/secret/);
  });
});

describe('reconciliation helpers', () => {
  it('cardinality and order-independent signatures', () => {
    expect(cardinalityOf(1, 1)).toBe('one_to_one');
    expect(cardinalityOf(1, 3)).toBe('one_to_many');
    expect(cardinalityOf(2, 1)).toBe('many_to_one');
    expect(cardinalityOf(2, 2)).toBe('many_to_many');
    expect(matchSignature(['b2', 'b1'], ['l1'])).toBe(matchSignature(['b1', 'b2'], ['l1']));
  });
  it('manual match: equal totals required unless the difference is explicitly recorded', () => {
    expect(validateManualMatch(['100', '50'], ['150'], false, '').difference.isZero()).toBe(true);
    expect(() => validateManualMatch(['-1245.50'], ['-1200'], false, '')).toThrow(/differ by -45.50/);
    expect(() => validateManualMatch(['-1245.50'], ['-1200'], true, '')).toThrow(/Explain/);
    const v = validateManualMatch(['-1245.50'], ['-1200'], true, 'bank over-charged, query raised');
    expect(v.difference.toString()).toBe('-45.5');
    expect(() => validateManualMatch([], ['1'], false, '')).toThrow();
  });
  it('balances: difference = bank-only − ledger-only + recorded diffs; resolving explains but does not remove', () => {
    const base = { openingStatement: '1000', bankAmounts: ['100', '7500', '200', '200'], ledgerAmounts: ['100', '-48200', '200'], confirmedMatchDifferences: [] as string[] };
    const exc = [
      { side: 'bank' as const, amount: '7500', status: 'open' as const, itemId: 'b2' },
      { side: 'bank' as const, amount: '200', status: 'investigating' as const, itemId: 'b4' },
      { side: 'ledger' as const, amount: '-48200', status: 'resolved' as const, itemId: 'l2' },
    ];
    const r = reconBalances({ ...base, exceptions: exc });
    expect(r.statementBalance.toString()).toBe('9000');
    expect(r.ledgerBalance.toString()).toBe('-46900');
    expect(r.difference.toString()).toBe('55900');
    expect(r.unexplained.isZero()).toBe(true);
    expect(r.explainedResolved.toString()).toBe('48200');
    expect(r.unresolvedDifference.toString()).toBe('7700');
    // before classification everything is unexplained
    const raw = reconBalances({ ...base, exceptions: [] });
    expect(raw.unresolvedDifference.toString()).toBe('55900');
  });
  it('auto-match planning is idempotent and does not re-propose rejected pairings', () => {
    const bank = [{ id: 'b1', date: '2026-10-02', amount: '15000', reference: 'INV-1' }, { id: 'b2', date: '2026-10-05', amount: '500', reference: 'X' }];
    const ledger = [{ id: 'l1', date: '2026-10-01', amount: '15000', reference: 'INV-1' }, { id: 'l2', date: '2026-10-05', amount: '500', reference: 'X' }];
    const first = planAutoMatch(bank, ledger, []);
    expect(first.insert).toHaveLength(2);
    const existing = first.insert.map((m, i) => ({ id: `m${i}`, status: 'proposed' as const, bankIds: m.bankIds, ledgerIds: m.ledgerIds }));
    const second = planAutoMatch(bank, ledger, existing);
    expect(second.insert).toHaveLength(0);
    expect(second.keep.sort()).toEqual(['m0', 'm1']);
    expect(second.drop).toHaveLength(0);
    const third = planAutoMatch(bank, ledger, [{ ...existing[1], status: 'rejected' }, existing[0]]);
    expect(third.insert).toHaveLength(0);
    expect(third.exceptions.filter((e) => e.kind === 'unmatched').map((e) => e.itemId).sort()).toEqual(['b2', 'l2']);
  });
});

describe('collections helpers', () => {
  const pol = [{ days_overdue: 1, action: 'reminder' }, { days_overdue: 15, action: 'second_reminder' }, { days_overdue: 45, action: 'escalation' }, { days_overdue: 90, action: 'legal_review' }];
  it('applicable policy is the highest threshold reached', () => {
    expect(policyFor(pol, 0)).toBeNull();
    expect(policyFor(pol, 1)?.action).toBe('reminder');
    expect(policyFor(pol, 31)?.action).toBe('second_reminder');
    expect(policyFor(pol, 120)?.action).toBe('legal_review');
  });
  it('renders templates, leaving unknown placeholders visible', () => {
    expect(renderTemplate('Dear {{merchant}}, {{number}} for {{amount}} ({{ days }} d) {{x}}', { merchant: 'A', number: 'INV-1', amount: 'MUR 10', days: '3' })).toBe('Dear A, INV-1 for MUR 10 (3 d) {{x}}');
  });
});

describe('liquidity stress tests', () => {
  it('months to breach', () => {
    expect(monthsToBreach(['5', '4', '2', '1'], '3')).toBe(3);
    expect(monthsToBreach(['5', '6'], '3')).toBeNull();
  });
  it('applies the standard shocks with projectCash', () => {
    const r = runStressTests({
      unrestrictedCash: '1000000', baseMonthlyFlow: '10000', minimumLiquidity: '900000', months: 12,
      largestMerchantContribution12m: '240000', merchantLossPct: '1', monthlyNetPaymentRevenue: '100000', acquirerSharePct: '0.3', acquirerMonths: 1,
      trailingGpv12m: '120000000', compressionBps: '15', creditSales12m: '365000', delayDays: '30', cloudCost12m: '480000', infraPct: '0.25', regulatoryOneOff: '200000', regulatoryMonth: 3,
    });
    const by = Object.fromEntries(r.map((s) => [s.key, s]));
    expect(by.base.endCash.toString()).toBe('1120000');
    expect(by.base.breachMonth).toBeNull();
    expect(by.major_merchant_loss.monthlyShock.toString()).toBe('-20000');
    expect(by.major_merchant_loss.endCash.toString()).toBe('880000');
    expect(by.major_merchant_loss.breachMonth).toBe(11);
    expect(by.acquirer_disruption.oneOff.toString()).toBe('30000');
    expect(by.margin_compression.monthlyShock.toString()).toBe('-15000');
    expect(by.collection_delay.oneOff.toString()).toBe('30000');
    expect(by.infra_cost.monthlyShock.toString()).toBe('-10000');
    expect(by.regulatory.projection[1].toString()).toBe('1020000');
    expect(by.regulatory.projection[2].toString()).toBe('830000');
    expect(by.regulatory.breachMonth).toBe(3);
  });
});

describe('supplier payment planning', () => {
  it('groups planned payments by week with overdue and later buckets', () => {
    const w = weekBuckets([{ date: '2026-10-28', amount: '10' }, { date: '2026-11-02', amount: '5' }, { date: '2026-11-08', amount: '1' }, { date: '2026-11-09', amount: '2' }, { date: '2027-03-01', amount: '7' }], '2026-11-02', 8);
    expect(w.overdue.total.toString()).toBe('10');
    expect(w.buckets[0].total.toString()).toBe('6');
    expect(w.buckets[1].total.toString()).toBe('2');
    expect(w.later.total.toString()).toBe('7');
  });
  it('matches paid invoices to bank outflows by payment reference or invoice number', () => {
    const r = matchSupplierPayments(
      [{ id: 'a', number: 'S01-1', payment_ref: 'PAY-1', amount_base: '100', paid_date: '2026-10-01' }, { id: 'b', number: 'S02-1', payment_ref: 'PAY-2', amount_base: '50', paid_date: '2026-10-01' }, { id: 'c', number: 'S03-1', payment_ref: 'PAY-3', amount_base: '70', paid_date: '2026-10-01' }],
      [{ id: 'x', reference: 'S01-1', amount_base: '-100', txn_date: '2026-10-01' }, { id: 'y', reference: 'pay-2', amount_base: '-49', txn_date: '2026-10-02' }],
    );
    expect(r.map((x) => x.status)).toEqual(['matched', 'amount_difference', 'unmatched']);
    expect(r[1].difference).toBe('-1');
  });
  it('scenario params: defaults, overrides and out-of-range rejection', () => {
    const d = scenariosFromParams(() => undefined);
    expect(d.map((s) => s.receiptDelayDays)).toEqual(DEFAULT_SCENARIOS.map((s) => s.receiptDelayDays));
    const o = scenariosFromParams((k) => ({ base_delay: '14', base_rate: '0.8', pessimistic_rate: '7', optimistic_out: 'abc' } as Record<string, string>)[k]);
    expect(o[0].receiptDelayDays).toBe(14);
    expect(o[0].collectionRate).toBe('0.8');
    expect(o[2].collectionRate).toBe('0.9');
    expect(o[1].outflowFactor).toBe('0.97');
  });
});
