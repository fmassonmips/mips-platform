import { describe, it, expect } from 'vitest';
import { dec, sum, safeDiv, applyBps, fromBps, toBps, pctChange, toStorage, convert } from '@/lib/money';

describe('money (decimal-safe)', () => {
  it('avoids binary floating point errors', () => {
    expect(dec('0.1').plus('0.2').toString()).toBe('0.3');
    expect(sum(['1000000.0001', '0.0002', '-0.0003']).toString()).toBe('1000000');
  });
  it('basis points are hundredths of a percentage point', () => {
    expect(fromBps(20).toString()).toBe('0.002');           // 20 bps = 0.20 percentage points
    expect(applyBps('1000000', 175).toString()).toBe('17500'); // 1.75 %
    expect(toBps('0.0195').toString()).toBe('195');
  });
  it('safe division never returns Infinity/NaN', () => {
    expect(safeDiv(10, 0)).toBeNull();
    expect(safeDiv(10, 4)!.toString()).toBe('2.5');
    expect(pctChange(110, 0)).toBeNull();
    expect(pctChange(90, -100)!.toString()).toBe('1.9');
  });
  it('rounds half-up to storage precision', () => {
    expect(toStorage('1.23455')).toBe('1.2346');
    expect(toStorage('2.5', 0)).toBe('3');
  });
  it('rejects invalid FX rates', () => {
    expect(() => convert(100, 0)).toThrow();
    expect(convert('100', '45.1234').toString()).toBe('4512.34');
  });
});
