/**
 * Decimal-safe financial arithmetic. ALL monetary and rate calculations go
 * through this module. JavaScript `number` is never used for money.
 *
 * Policies (documented in docs/financial-formula-dictionary.md):
 *  - Internal precision: 40 significant digits.
 *  - Stored precision: money 4 dp (numeric(20,4)); KPI values 8 dp.
 *  - Presentation rounding: ROUND_HALF_UP to the currency's minor units.
 *  - Basis points: 1 bp = 0.01 percentage point = 0.0001 as a fraction.
 */
import Decimal from 'decimal.js';

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;
export type DecLike = Dec | string | number;

export const ZERO = new D(0);
export const ONE = new D(1);
export const BPS_PER_UNIT = new D(10000);

export function dec(v: DecLike | null | undefined): Dec {
  if (v === null || v === undefined || v === '') return ZERO;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite number passed to dec()');
    return new D(v.toString());
  }
  return new D(v);
}

export function sum(values: Iterable<DecLike | null | undefined>): Dec {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(dec(v));
  return acc;
}

/** Safe division: returns null when the denominator is zero (never Infinity/NaN). */
export function safeDiv(n: DecLike, d: DecLike): Dec | null {
  const dd = dec(d);
  if (dd.isZero()) return null;
  return dec(n).div(dd);
}

/** Fraction -> basis points (0.0175 -> 175). */
export function toBps(fraction: DecLike): Dec { return dec(fraction).times(BPS_PER_UNIT); }
/** Basis points -> fraction (175 -> 0.0175). */
export function fromBps(bps: DecLike): Dec { return dec(bps).div(BPS_PER_UNIT); }
/** Apply a rate expressed in bps to an amount. */
export function applyBps(amount: DecLike, bps: DecLike): Dec { return dec(amount).times(fromBps(bps)); }

/** Percentage change, null when base is zero. Returned as a fraction (0.05 = 5 %). */
export function pctChange(current: DecLike, previous: DecLike): Dec | null {
  const p = dec(previous);
  if (p.isZero()) return null;
  return dec(current).minus(p).div(p.abs());
}

export function round(v: DecLike, dp = 2): Dec { return dec(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP); }
export function toStorage(v: DecLike, dp = 4): string { return dec(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp); }
export function str(v: Dec | null | undefined, dp?: number): string | null {
  if (v === null || v === undefined) return null;
  return dp === undefined ? v.toString() : v.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
}

export function max(a: DecLike, b: DecLike): Dec { const x = dec(a), y = dec(b); return x.gt(y) ? x : y; }
export function min(a: DecLike, b: DecLike): Dec { const x = dec(a), y = dec(b); return x.lt(y) ? x : y; }

/** Convert an amount to base currency using an explicit rate reference. */
export function convert(amount: DecLike, rateToBase: DecLike): Dec {
  const r = dec(rateToBase);
  if (r.lte(0)) throw new Error('Invalid FX rate: must be > 0');
  return dec(amount).times(r);
}
