/**
 * Break-even computation shared by the page (GET simulation) and the snapshot
 * server action (which recomputes server-side — client numbers are never trusted).
 */
import type { Tx } from '@/lib/db';
import { breakEvenBase, type BreakEvenBaseData } from '@/lib/services/merchants';
import { breakEven, type BreakEvenInput, type BreakEvenSim, type BreakEvenResult } from '@/lib/engine/breakeven';
import { parseDecimalInput } from '@/lib/services/segmentation';
import { dec, ZERO, type Dec } from '@/lib/money';

export const PARAM_KEYS = ['mdr', 'growth', 'staff', 'infra', 'mix', 'acq', 'cash', 'other'] as const;
export type ParamKey = typeof PARAM_KEYS[number];

export interface BeParams { mdrChangeBps: Dec; txnGrowthPct: Dec; newStaffMonthly: Dec; infraMonthly: Dec; mixTakeRateDeltaBps: Dec; wholesaleChangeBps: Dec; cashOnlyFixed: Dec | null; includeOtherRevenue: boolean }

export function parseBeParams(get: (k: ParamKey) => string | undefined): { p: BeParams; errors: string[] } {
  const errors: string[] = [];
  const n = (k: ParamKey, label: string, range?: { min?: string; max?: string }) => { try { return parseDecimalInput(get(k), label, range); } catch (e: any) { errors.push(e.message); return null; } };
  const p: BeParams = {
    mdrChangeBps: n('mdr', 'MDR change (bps)', { min: '-1000', max: '1000' }) ?? ZERO,
    txnGrowthPct: n('growth', 'Transaction growth (%)', { min: '-100', max: '1000' }) ?? ZERO,
    newStaffMonthly: n('staff', 'New staff monthly cost', { min: '0', max: '100000000' }) ?? ZERO,
    infraMonthly: n('infra', 'Infrastructure monthly investment', { min: '0', max: '100000000' }) ?? ZERO,
    mixTakeRateDeltaBps: n('mix', 'Product-mix take-rate delta (bps)', { min: '-1000', max: '1000' }) ?? ZERO,
    wholesaleChangeBps: n('acq', 'Acquirer cost change (bps)', { min: '-1000', max: '1000' }) ?? ZERO,
    cashOnlyFixed: n('cash', 'Cash-only fixed outflows', { min: '0', max: '100000000' }),
    includeOtherRevenue: get('other') !== '0',
  };
  return { p, errors };
}

export interface BreakEvenComputation {
  base: BreakEvenBaseData; input: BreakEvenInput; sim: BreakEvenSim; baseRes: BreakEvenResult; simRes: BreakEvenResult;
  cashOnlyFixed: string; cashDefaulted: boolean; recurringIncome: string;
  curve: { label: string; gpv: string; base: string; sim: string; simCash: string }[];
}

export async function computeBreakEven(t: Tx, endMonth: string, p: BeParams, months = 3): Promise<BreakEvenComputation> {
  const base = await breakEvenBase(t, endMonth, months);
  const a = base.avg;
  const cash = p.cashOnlyFixed ?? dec(a.loanRepayments);
  const recurring = dec(a.saas).plus(p.includeOtherRevenue ? dec(a.otherRevenue) : ZERO);
  const input: BreakEvenInput = { gpv: a.gpv, successes: a.successes, activeMerchants: a.activeMerchants, mdr: a.mdr, wholesale: a.wholesale, processing: a.processing, saas: recurring.toString(), fixedCosts: dec(a.opex).plus(a.dAndA).toString(), depreciation: a.dAndA, cashOnlyFixed: cash.toString() };
  const sim: BreakEvenSim = { mdrChangeBps: p.mdrChangeBps.toString(), txnGrowthPct: p.txnGrowthPct.div(100).toString(), newStaffMonthly: p.newStaffMonthly.toString(), infraMonthly: p.infraMonthly.toString(), mixTakeRateDeltaBps: p.mixTakeRateDeltaBps.toString(), wholesaleChangeBps: p.wholesaleChangeBps.toString() };
  const baseRes = breakEven(input);
  const simRes = breakEven(input, sim);
  // Profit curve vs volume (multiples of the base volume); x shows GPV.
  const curve = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5].map((mult) => {
    const g = dec(mult).minus(1).toString();
    const b = breakEven(input, { txnGrowthPct: g });
    const s = breakEven(input, { ...sim, txnGrowthPct: g });
    return { label: `${(mult * 100).toFixed(0)}%`, gpv: b.gpv.toString(), base: b.operatingProfit.toDecimalPlaces(2).toString(), sim: s.operatingProfit.toDecimalPlaces(2).toString(), simCash: s.operatingCashProfit.toDecimalPlaces(2).toString() };
  });
  return { base, input, sim, baseRes, simRes, cashOnlyFixed: cash.toString(), cashDefaulted: p.cashOnlyFixed === null, recurringIncome: recurring.toString(), curve };
}

/** Serialise a result to decimal strings (for evidence snapshots). */
export function serialiseResult(r: BreakEvenResult): Record<string, string | null> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? null : (v as Dec).toDecimalPlaces(6).toString()]));
}
