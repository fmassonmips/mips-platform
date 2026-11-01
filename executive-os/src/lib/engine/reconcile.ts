/**
 * Bank reconciliation matcher (RECON v1). Pure function — proposes matches; it
 * never writes off differences. Proposed auto-matches still require confirmation.
 *
 * Pass order: duplicates → 1:1 by reference+amount → 1:1 by amount within date
 * window (unique candidate only) → many-to-one / one-to-many by reference or
 * date window (subset sum, ≤ 5 items) → near-miss detection → unmatched.
 */
import { daysBetween } from '../dates';
import { dec, sum, type Dec } from '../money';

export interface ReconItem { id: string; date: string; amount: string; reference?: string | null; description?: string | null }
export interface ProposedMatch { cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one'; rule: string; bankIds: string[]; ledgerIds: string[]; bankTotal: Dec; ledgerTotal: Dec; difference: Dec }
export interface ReconException { side: 'bank' | 'ledger'; itemId: string; kind: 'unmatched' | 'duplicate' | 'amount_difference'; amount: Dec; relatedId?: string; difference?: Dec }
export interface ReconOptions { dateWindowDays: number; maxGroupSize: number }

const norm = (s?: string | null) => (s ?? '').trim().toUpperCase().replace(/\s+/g, '');

function subsetSum(items: ReconItem[], target: Dec, maxSize: number): ReconItem[] | null {
  const cand = items.slice(0, 14);
  const n = cand.length;
  let best: ReconItem[] | null = null;
  const rec = (start: number, chosen: ReconItem[], acc: Dec) => {
    if (best) return;
    if (chosen.length >= 2 && acc.eq(target)) { best = [...chosen]; return; }
    if (chosen.length >= maxSize) return;
    for (let i = start; i < n; i++) { chosen.push(cand[i]); rec(i + 1, chosen, acc.plus(dec(cand[i].amount))); chosen.pop(); if (best) return; }
  };
  rec(0, [], dec(0));
  return best;
}

export function reconcile(bank: ReconItem[], ledger: ReconItem[], opts: ReconOptions = { dateWindowDays: 3, maxGroupSize: 5 }) {
  const matches: ProposedMatch[] = []; const exceptions: ReconException[] = [];
  const usedB = new Set<string>(), usedL = new Set<string>();
  const within = (a: string, b: string) => Math.abs(daysBetween(a, b)) <= opts.dateWindowDays;

  // 1. Duplicates on the bank side (same date, amount, reference/description)
  const seen = new Map<string, string>();
  for (const b of bank) {
    const key = `${b.date}|${dec(b.amount).toFixed(4)}|${norm(b.reference) || norm(b.description)}`;
    const first = seen.get(key);
    if (first) { exceptions.push({ side: 'bank', itemId: b.id, kind: 'duplicate', amount: dec(b.amount), relatedId: first }); usedB.add(b.id); }
    else seen.set(key, b.id);
  }
  const push = (cardinality: ProposedMatch['cardinality'], rule: string, bs: ReconItem[], ls: ReconItem[]) => {
    const bt = sum(bs.map((x) => x.amount)), lt = sum(ls.map((x) => x.amount));
    matches.push({ cardinality, rule, bankIds: bs.map((x) => x.id), ledgerIds: ls.map((x) => x.id), bankTotal: bt, ledgerTotal: lt, difference: bt.minus(lt) });
    bs.forEach((x) => usedB.add(x.id)); ls.forEach((x) => usedL.add(x.id));
  };

  // 2. Reference + exact amount
  const ledgerByRef = new Map<string, ReconItem[]>();
  for (const l of ledger) { const r = norm(l.reference); if (r) ledgerByRef.set(r, [...(ledgerByRef.get(r) ?? []), l]); }
  for (const b of bank) {
    if (usedB.has(b.id)) continue;
    const r = norm(b.reference); if (!r) continue;
    const c = (ledgerByRef.get(r) ?? []).find((l) => !usedL.has(l.id) && dec(l.amount).eq(dec(b.amount)));
    if (c) push('one_to_one', 'reference_and_amount', [b], [c]);
  }
  // 3. Exact amount within window, unique candidate on both sides
  for (const b of bank) {
    if (usedB.has(b.id)) continue;
    const cands = ledger.filter((l) => !usedL.has(l.id) && dec(l.amount).eq(dec(b.amount)) && within(l.date, b.date));
    if (cands.length !== 1) continue;
    const rev = bank.filter((x) => !usedB.has(x.id) && dec(x.amount).eq(dec(cands[0].amount)) && within(x.date, cands[0].date));
    if (rev.length === 1) push('one_to_one', 'amount_within_date_window', [b], cands);
  }
  // 4a. many bank -> one ledger
  for (const l of ledger) {
    if (usedL.has(l.id)) continue;
    const pool = bank.filter((b) => !usedB.has(b.id) && Math.sign(dec(b.amount).toNumber()) === Math.sign(dec(l.amount).toNumber()) && ((norm(l.reference) && norm(b.reference) === norm(l.reference)) || within(b.date, l.date)));
    const s = subsetSum(pool, dec(l.amount), opts.maxGroupSize);
    if (s) push('many_to_one', 'subset_sum', s, [l]);
  }
  // 4b. one bank -> many ledger
  for (const b of bank) {
    if (usedB.has(b.id)) continue;
    const pool = ledger.filter((l) => !usedL.has(l.id) && Math.sign(dec(l.amount).toNumber()) === Math.sign(dec(b.amount).toNumber()) && ((norm(b.reference) && norm(l.reference) === norm(b.reference)) || within(l.date, b.date)));
    const s = subsetSum(pool, dec(b.amount), opts.maxGroupSize);
    if (s) push('one_to_many', 'subset_sum', [b], s);
  }
  // 5. Near misses: same reference, different amount -> amount_difference exception (no write-off)
  for (const b of bank) {
    if (usedB.has(b.id)) continue;
    const r = norm(b.reference);
    const l = r ? ledger.find((x) => !usedL.has(x.id) && norm(x.reference) === r) : undefined;
    if (l) {
      const diff = dec(b.amount).minus(dec(l.amount));
      exceptions.push({ side: 'bank', itemId: b.id, kind: 'amount_difference', amount: dec(b.amount), relatedId: l.id, difference: diff });
      exceptions.push({ side: 'ledger', itemId: l.id, kind: 'amount_difference', amount: dec(l.amount), relatedId: b.id, difference: diff.neg() });
      usedB.add(b.id); usedL.add(l.id);
    }
  }
  for (const b of bank) if (!usedB.has(b.id)) exceptions.push({ side: 'bank', itemId: b.id, kind: 'unmatched', amount: dec(b.amount) });
  for (const l of ledger) if (!usedL.has(l.id)) exceptions.push({ side: 'ledger', itemId: l.id, kind: 'unmatched', amount: dec(l.amount) });
  const unresolved = sum(exceptions.filter((e) => e.kind !== 'duplicate' && e.side === 'bank').map((e) => e.amount)).minus(sum(exceptions.filter((e) => e.kind !== 'duplicate' && e.side === 'ledger').map((e) => e.amount)));
  return { matches, exceptions, unresolvedDifference: unresolved };
}
