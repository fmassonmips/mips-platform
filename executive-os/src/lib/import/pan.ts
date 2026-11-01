/**
 * Primary Account Number (card number) detector for imports.
 *
 * MIPS Executive OS must never store full card numbers (PCI DSS scope). Every
 * uploaded file is scanned before anything is persisted; a file containing a
 * plausible PAN is refused outright. Masked forms (first 6 / last 4 with `*`,
 * `X` or `•`) are accepted.
 *
 * A candidate is a run of 13–19 digits, optionally grouped by single spaces or
 * hyphens, not glued to other digits or to a decimal part, that passes the Luhn
 * check and starts with a card-scheme prefix (Visa, Mastercard, Amex, Discover,
 * Diners, JCB, UnionPay, Maestro). Luhn alone would flag ~10 % of arbitrary
 * long numeric references; the prefix filter removes most of those.
 */

export interface PanHit { row: number; column: string; masked: string }
export interface PanReport { count: number; hits: PanHit[] }

const CANDIDATE = /(?<!\d)(?<!\d[.,])\d(?:[ -]?\d){12,18}(?!\d)(?![.,]\d)/g;

export function luhn(digits: string): boolean {
  let sum = 0; let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** True when the digit string starts with a known card-scheme prefix and has a valid length for it. */
export function schemePrefix(d: string): boolean {
  const n = d.length; const p2 = Number(d.slice(0, 2)); const p3 = Number(d.slice(0, 3)); const p4 = Number(d.slice(0, 4)); const p6 = Number(d.slice(0, 6));
  if (d[0] === '4') return n === 13 || n === 16 || n === 19;                              // Visa
  if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return n === 16;              // Mastercard
  if (p2 === 34 || p2 === 37) return n === 15;                                            // Amex
  if (p4 === 6011 || p2 === 65 || (p3 >= 644 && p3 <= 649) || (p6 >= 622126 && p6 <= 622925)) return n >= 16 && n <= 19; // Discover
  if (p2 === 62) return n >= 16 && n <= 19;                                               // UnionPay
  if (p2 === 36 || p2 === 38 || p2 === 39 || (p3 >= 300 && p3 <= 305) || p3 === 309) return n >= 14 && n <= 19; // Diners
  if (p4 >= 3528 && p4 <= 3589) return n >= 16 && n <= 19;                                 // JCB
  if (p2 === 50 || (p2 >= 56 && p2 <= 69)) return n >= 12 && n <= 19;                     // Maestro & other 5x/6x
  return false;
}

/** Mask to first 6 / last 4 (the PCI DSS maximum display), never returning the full number. */
export function maskPan(d: string): string {
  return `${d.slice(0, 6)}${'*'.repeat(Math.max(0, d.length - 10))}${d.slice(-4)}`;
}

export function findPansInText(text: string): string[] {
  if (!text || text.length < 13) return [];
  const out: string[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const d = m[0].replace(/[ -]/g, '');
    if (d.length >= 13 && d.length <= 19 && schemePrefix(d) && luhn(d)) out.push(d);
  }
  return out;
}

/** Scan headers and every cell. Data rows are numbered as in the file (header = row 1). */
export function scanForPans(columns: string[], rows: string[][], maxHits = 10): PanReport {
  const hits: PanHit[] = []; let count = 0;
  const visit = (text: string, row: number, column: string) => {
    for (const d of findPansInText(text)) { count++; if (hits.length < maxHits) hits.push({ row, column, masked: maskPan(d) }); }
  };
  columns.forEach((c, j) => visit(c, 1, `#${j + 1}`));
  rows.forEach((r, i) => r.forEach((cell, j) => visit(cell, i + 2, columns[j] || `#${j + 1}`)));
  return { count, hits };
}

export function panRefusalMessage(r: PanReport): string {
  const where = r.hits.slice(0, 3).map((h) => `row ${h.row}, column "${h.column}" (${h.masked})`).join('; ');
  return `Import refused: the file contains ${r.count} full card number${r.count > 1 ? 's' : ''} (PAN) — ${where}${r.count > 3 ? '; …' : ''}. ` +
    'Nothing was stored. Mask card numbers to at most the first 6 and last 4 digits, then upload again.';
}
