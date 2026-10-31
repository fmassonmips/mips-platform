import { describe, it, expect } from 'vitest';
import {
  plStatement, plMargins, variance, isMaterial, detectAnomalies, operatingLeverage, growthRates, fullYearForecast,
  fiscalQuarterOf, bucketOf, fiscalYearMonths, shiftYears, comparisonRange, covered, sumBase, sumBasePresent, dbErrorMessage, materialityPct, higherIsBetter,
} from '@/lib/services/finance';
import { dec } from '@/lib/money';

describe('P&L statement', () => {
  const base = { revenue: '1000000.10', cost_of_sales: '60000.05', opex: '700000', d_and_a: '39200', finance_income: '2085.22', finance_costs: '4400', tax: '30000' };
  it('builds subtotals exactly in decimal', () => {
    const p = plStatement(base);
    expect(p.gross_profit!.toString()).toBe('940000.05');
    expect(p.ebitda!.toString()).toBe('240000.05');
    expect(p.operating_profit!.toString()).toBe('200800.05');
    expect(p.pbt!.toString()).toBe('198485.27');
    expect(p.net_profit!.toString()).toBe('168485.27');
  });
  it('net profit equals Σ(income) − Σ(expense) — the reconciliation identity', () => {
    const p = plStatement(base);
    const income = dec(base.revenue).plus(base.finance_income);
    const expense = dec(base.cost_of_sales).plus(base.opex).plus(base.d_and_a).plus(base.finance_costs).plus(base.tax);
    expect(p.net_profit!.eq(income.minus(expense))).toBe(true);
  });
  it('propagates null when a component is missing (e.g. D&A not budgeted)', () => {
    const p = plStatement({ revenue: '100', cost_of_sales: '10', opex: '50', d_and_a: null });
    expect(p.ebitda!.toString()).toBe('40');
    expect(p.operating_profit).toBeNull();
    expect(p.net_profit).toBeNull();
  });
  it('margins are null-safe on zero revenue', () => {
    expect(plMargins(plStatement({ ...base, revenue: '0' })).gross).toBeNull();
    expect(plMargins(plStatement(base)).ebitda!.toDecimalPlaces(4).toString()).toBe('0.24');
  });
  it('sumBase vs sumBasePresent distinguish zero from not budgeted', () => {
    const rows = [{ pl_line: 'revenue', amount: '10' }, { pl_line: 'revenue', amount: '5.5' }, { pl_line: 'opex', amount: '3' }];
    expect(sumBase(rows).revenue.toString()).toBe('15.5');
    expect(sumBase(rows).tax.toString()).toBe('0');
    expect(sumBasePresent(rows).tax).toBeNull();
    expect(sumBasePresent(rows).opex!.toString()).toBe('3');
  });
  it('direction of lines', () => {
    expect(higherIsBetter('revenue')).toBe(true);
    expect(higherIsBetter('opex')).toBe(false);
    expect(higherIsBetter('ebitda')).toBe(true);
  });
});

describe('variance & materiality', () => {
  it('computes abs/pct and favourability by direction', () => {
    const r = variance('900', '1000', true);
    expect(r.abs!.toString()).toBe('-100');
    expect(r.pct!.toString()).toBe('-0.1');
    expect(r.favourable).toBe(false);
    expect(variance('900', '1000', false).favourable).toBe(true);
    expect(variance(null, '1000', true).abs).toBeNull();
    expect(variance('5', '0', true).pct).toBeNull();
  });
  it('flags material deviations at the tenant threshold', () => {
    expect(isMaterial('1049', '1000', '5')).toBe(false);
    expect(isMaterial('1050', '1000', '5')).toBe(true);
    expect(isMaterial('950', '1000', 5)).toBe(true);
    expect(isMaterial('1', '0', 5)).toBe(true);
    expect(isMaterial(null, '0', 5)).toBe(false);
  });
  it('materiality setting defaults to 5 %', () => {
    expect(materialityPct({}).toString()).toBe('5');
    expect(materialityPct({ materiality_pct: '2.5' }).toString()).toBe('2.5');
    expect(materialityPct({ materiality_pct: 'abc' }).toString()).toBe('5');
  });
  it('commentary coverage matches version, month and key', () => {
    const c = [{ version_id: 'v1', period: '2026-09-01', line_key: 'revenue' }];
    expect(covered(c, 'v1', '2026-09-01', ['4000', 'revenue'])).toBe(true);
    expect(covered(c, 'v1', '2026-10-01', ['revenue'])).toBe(false);
    expect(covered(c, 'v2', '2026-09-01', ['revenue'])).toBe(false);
  });
});

describe('anomaly detection (z-score vs trailing 6 months)', () => {
  const months = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'];
  it('flags a >2σ spike with explanation', () => {
    const vals = ['100', '102', '98', '101', '99', '100', '130', '101'];
    const r = detectAnomalies(months.map((p, i) => ({ period: p, value: vals[i] })));
    const jul = r.find((x) => x.period === '2026-07-01')!;
    expect(jul.anomaly).toBe(true);
    expect(jul.direction).toBe('above');
    expect(jul.n).toBe(6);
    expect(jul.mean!.toString()).toBe('100');
    expect(jul.z!.gt(2)).toBe(true);
    expect(jul.reason).toMatch(/σ above the trailing 6-month mean/);
    // after the spike, the next normal month is not flagged (spike widens σ)
    expect(r.find((x) => x.period === '2026-08-01')!.anomaly).toBe(false);
  });
  it('requires minimum history', () => {
    const r = detectAnomalies([{ period: 'a', value: '1' }, { period: 'b', value: '100' }]);
    expect(r.every((x) => !x.anomaly && x.z === null)).toBe(true);
  });
  it('flat history: flags deviations beyond tolerance only', () => {
    const flat = ['50', '50', '50', '50', '50'];
    const a = detectAnomalies([...flat, '51'].map((v, i) => ({ period: String(i), value: v })));
    expect(a[5].anomaly).toBe(false); // 2 % < 5 % tolerance
    const b = detectAnomalies([...flat, '60'].map((v, i) => ({ period: String(i), value: v })));
    expect(b[5].anomaly).toBe(true);
    expect(b[5].z).toBeNull();
  });
  it('materiality floor suppresses statistically unusual but small deviations', () => {
    const vals = ['1000', '1001', '999', '1000', '1001', '999', '1010'];
    const pts = vals.map((v, i) => ({ period: String(i), value: v }));
    expect(detectAnomalies(pts)[6].anomaly).toBe(true);            // z ≈ 11 but only +1 %
    expect(detectAnomalies(pts, { minDeviationPct: 5 })[6].anomaly).toBe(false);
  });
  it('detects drops as well as spikes', () => {
    const vals = ['200', '205', '195', '202', '198', '200', '150'];
    const r = detectAnomalies(vals.map((v, i) => ({ period: String(i), value: v })));
    expect(r[6].anomaly).toBe(true);
    expect(r[6].direction).toBe('below');
  });
});

describe('operating leverage', () => {
  it('= %Δ operating profit / %Δ revenue', () => {
    const r = operatingLeverage('1100', '1000', '230', '200');
    expect(r.revenueChange!.toString()).toBe('0.1');
    expect(r.opChange!.toString()).toBe('0.15');
    expect(r.value!.toString()).toBe('1.5');
  });
  it('is null-safe', () => {
    expect(operatingLeverage('1000', '1000', '230', '200').value).toBeNull();
    expect(operatingLeverage('1000', '0', '230', '200').value).toBeNull();
    expect(operatingLeverage('1100', '1000', '230', '0').value).toBeNull();
    expect(operatingLeverage(null, '1000', '230', '200').note).toMatch(/Missing/);
  });
  it('uses |prior| for negative operating profit', () => {
    const r = operatingLeverage('1100', '1000', '-50', '-100');
    expect(r.opChange!.toString()).toBe('0.5');
    expect(r.value!.toString()).toBe('5');
  });
});

describe('growth, fiscal calendar and forecast', () => {
  const series = new Map<string, string>();
  ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']
    .forEach((m, i) => series.set(m, String(100 + i * 10)));
  it('MoM / QoQ / YoY', () => {
    const g = growthRates(series, '2026-10-01');
    expect(g.mom!.toDecimalPlaces(6).toString()).toBe(dec(220).minus(210).div(210).toDecimalPlaces(6).toString());
    expect(g.qoq!.toString()).toBe(dec(200 + 210 + 220).minus(170 + 180 + 190).div(170 + 180 + 190).toString());
    expect(g.yoy!.toString()).toBe('1.2');
    expect(growthRates(series, '2025-10-01').mom).toBeNull();
  });
  it('fiscal quarters and buckets (FY starts July)', () => {
    expect(fiscalQuarterOf('2026-07-01', 7)).toBe('FY2027 Q1');
    expect(fiscalQuarterOf('2026-10-01', 7)).toBe('FY2027 Q2');
    expect(fiscalQuarterOf('2027-06-01', 7)).toBe('FY2027 Q4');
    expect(fiscalQuarterOf('2026-03-01', 1)).toBe('FY2026 Q1');
    expect(bucketOf('2026-08-01', 'annual', 7)).toBe('FY2027');
    expect(bucketOf('2026-08-01', 'monthly', 7)).toBe('2026-08');
    expect(fiscalYearMonths(2027, 7)).toHaveLength(12);
    expect(fiscalYearMonths(2027, 7)[0]).toBe('2026-07-01');
  });
  it('full-year forecast = actual YTD + remaining plan', () => {
    const fy = fiscalYearMonths(2027, 7);
    const actual = new Map([['2026-07-01', '10'], ['2026-08-01', '11'], ['2026-09-01', '12'], ['2026-10-01', '13']]);
    const plan = new Map(fy.map((m) => [m, '20']));
    expect(fullYearForecast(fy, actual, plan, '2026-10-01').toString()).toBe(String(10 + 11 + 12 + 13 + 8 * 20));
  });
  it('comparison ranges', () => {
    expect(comparisonRange('2026-10-01', '2026-10-31', 'prior')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(comparisonRange('2026-07-01', '2026-09-30', 'prior')).toEqual({ start: '2026-04-01', end: '2026-06-30' });
    expect(comparisonRange('2026-10-01', '2026-10-31', 'yoy')).toEqual({ start: '2025-10-01', end: '2025-10-31' });
    expect(shiftYears('2028-02-29', -1)).toBe('2027-02-28');
  });
  it('maps DB errors to readable messages', () => {
    expect(dbErrorMessage({ code: '23514', table: 'budget_versions', message: 'violates check constraint' })).toMatch(/Segregation of duties/);
    expect(dbErrorMessage({ code: 'P0001', message: 'VERSION_LOCKED: approved budget versions are locked' })).toMatch(/locked/);
    expect(dbErrorMessage({ code: '23505' })).toMatch(/unique/);
  });
});
