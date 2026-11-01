import { describe, it, expect } from 'vitest';
import { luhn, findPansInText, scanForPans, maskPan, panRefusalMessage } from '@/lib/import/pan';

describe('PAN detector', () => {
  it('Luhn check', () => {
    expect(luhn('4111111111111111')).toBe(true);
    expect(luhn('4111111111111112')).toBe(false);
  });
  it('finds scheme test numbers, plain or grouped', () => {
    expect(findPansInText('4111111111111111')).toEqual(['4111111111111111']);          // Visa
    expect(findPansInText('card 5555 5555 5555 4444 ok')).toEqual(['5555555555554444']); // Mastercard, spaces
    expect(findPansInText('3782-822463-10005')).toEqual(['378282246310005']);           // Amex, hyphens
    expect(findPansInText('2223003122003222')).toEqual(['2223003122003222']);           // Mastercard 2-series
    expect(findPansInText('6011111111111117')).toEqual(['6011111111111117']);           // Discover
    expect(findPansInText('ref=4012888888881881;')).toEqual(['4012888888881881']);
  });
  it('accepts masked numbers and ordinary financial data', () => {
    for (const s of ['411111******1111', '4111 11XX XXXX 1111', '411111••••••1111', '20000.00', '2026-10-30T10:00:00+04:00',
      '1234567890123.45', 'IT-0001', '+230 5251 2345', '9876543210987654', '0000000000000000']) expect(findPansInText(s)).toEqual([]);
  });
  it('rejects Luhn-valid numbers without a card-scheme prefix (references, IBAN digits)', () => {
    expect(luhn('7992739871300000')).toBe(false);
    expect(findPansInText('1000000000000008')).toEqual([]); // Luhn-valid, prefix 1 is not a card scheme
  });
  it('does not match inside longer digit runs or decimals', () => {
    expect(findPansInText('41111111111111110')).toEqual([]);
    expect(findPansInText('0.4111111111111111')).toEqual([]);
  });
  it('scan reports file row numbers, columns and masked values only', () => {
    const r = scanForPans(['ref', 'amount'], [['A1', '10.00'], ['4111111111111111', '20.00'], ['x', 'pan 5555555555554444']]);
    expect(r.count).toBe(2);
    expect(r.hits).toEqual([{ row: 3, column: 'ref', masked: '411111******1111' }, { row: 4, column: 'amount', masked: '555555******4444' }]);
    const msg = panRefusalMessage(r);
    expect(msg).not.toMatch(/4111111111111111|5555555555554444/);
    expect(msg).toMatch(/Nothing was stored/);
    expect(maskPan('378282246310005')).toBe('378282*****0005');
  });
});
