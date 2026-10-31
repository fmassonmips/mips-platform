/**
 * Revenue bridge (period A -> period B) at merchant level.
 * Decomposition (sums exactly to the total change):
 *   new merchants      revenue of merchants with no prior-period revenue
 *   lost merchants     −prior revenue of merchants with no current revenue
 *   volume effect      Σ (GPV_b − GPV_a) × takeRate_a          (continuing merchants)
 *   price/rate effect  Σ (takeRate_b − takeRate_a) × GPV_b      (continuing merchants)
 *   non-transactional  change in SaaS / other revenue          (continuing merchants)
 * Volume is further split into transaction-count and average-ticket effects.
 * This makes explicit that volume growth is not revenue growth.
 */
import { dec, safeDiv, sum, ZERO, type Dec, type DecLike } from '../money';

export interface MerchantPeriod { gpv: DecLike; txnRevenue: DecLike; otherRevenue: DecLike; successes: DecLike }
export interface BridgeResult {
  start: Dec; end: Dec; newMerchants: Dec; lostMerchants: Dec; txnCountEffect: Dec; avgTicketEffect: Dec; volumeEffect: Dec; rateEffect: Dec; otherRevenueEffect: Dec; check: Dec;
  byMerchant: { key: string; delta: Dec; volume: Dec; rate: Dec; kind: 'new' | 'lost' | 'continuing' }[];
}

export function revenueBridge(a: Record<string, MerchantPeriod>, b: Record<string, MerchantPeriod>): BridgeResult {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let start = ZERO, end = ZERO, nw = ZERO, lost = ZERO, vol = ZERO, rate = ZERO, other = ZERO, cnt = ZERO, tick = ZERO;
  const byMerchant: BridgeResult['byMerchant'] = [];
  for (const k of keys) {
    const pa = a[k], pb = b[k];
    const ra = pa ? dec(pa.txnRevenue).plus(dec(pa.otherRevenue)) : ZERO;
    const rb = pb ? dec(pb.txnRevenue).plus(dec(pb.otherRevenue)) : ZERO;
    start = start.plus(ra); end = end.plus(rb);
    if (ra.isZero() && !rb.isZero()) { nw = nw.plus(rb); byMerchant.push({ key: k, delta: rb, volume: ZERO, rate: ZERO, kind: 'new' }); continue; }
    if (!ra.isZero() && rb.isZero()) { lost = lost.minus(ra); byMerchant.push({ key: k, delta: ra.neg(), volume: ZERO, rate: ZERO, kind: 'lost' }); continue; }
    if (ra.isZero() && rb.isZero()) continue;
    const gA = dec(pa!.gpv), gB = dec(pb!.gpv);
    const trA = safeDiv(pa!.txnRevenue, gA) ?? ZERO;
    const trB = safeDiv(pb!.txnRevenue, gB) ?? ZERO;
    const v = gB.minus(gA).times(trA);
    const r = trB.minus(trA).times(gB);
    // txn revenue identity: trB*gB - trA*gA = (gB-gA)*trA + (trB-trA)*gB
    // when a period has zero GPV but txn revenue (edge), push residual into rate
    const txnDelta = dec(pb!.txnRevenue).minus(dec(pa!.txnRevenue));
    const residual = txnDelta.minus(v).minus(r);
    const o = dec(pb!.otherRevenue).minus(dec(pa!.otherRevenue));
    vol = vol.plus(v); rate = rate.plus(r).plus(residual); other = other.plus(o);
    // split volume: count effect at prior ticket, ticket effect at current count
    const sA = dec(pa!.successes), sB = dec(pb!.successes);
    const tA = safeDiv(gA, sA) ?? ZERO, tB = safeDiv(gB, sB) ?? ZERO;
    const c = sB.minus(sA).times(tA).times(trA);
    cnt = cnt.plus(c); tick = tick.plus(v.minus(c));
    byMerchant.push({ key: k, delta: rb.minus(ra), volume: v, rate: r.plus(residual), kind: 'continuing' });
  }
  const check = end.minus(start).minus(nw.plus(lost).plus(vol).plus(rate).plus(other));
  byMerchant.sort((x, y) => y.delta.abs().cmp(x.delta.abs()));
  return { start, end, newMerchants: nw, lostMerchants: lost, txnCountEffect: cnt, avgTicketEffect: tick, volumeEffect: vol, rateEffect: rate, otherRevenueEffect: other, check, byMerchant };
}

/** Herfindahl–Hirschman index and top-N share, on revenue shares. */
export function concentration(values: DecLike[], topN = 5) {
  const vals = values.map(dec).filter((v) => v.gt(0)).sort((a, b) => b.cmp(a));
  const total = sum(vals);
  if (total.isZero()) return { hhi: null as Dec | null, topShare: null as Dec | null, top1Share: null as Dec | null };
  const hhi = sum(vals.map((v) => v.div(total).times(100).pow(2)));
  return { hhi, topShare: sum(vals.slice(0, topN)).div(total), top1Share: vals[0].div(total) };
}
