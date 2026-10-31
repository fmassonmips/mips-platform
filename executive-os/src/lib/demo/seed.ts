/**
 * DEMO data generator. Deterministic (seeded PRNG). Every record is flagged
 * is_demo / named "(DEMO)". This is SYNTHETIC data and must never be presented
 * as actual MIPSIT Digital Ltd results.
 *
 * Embedded storylines (used by the acceptance test):
 *  1. SBM raises the international-card wholesale fee from 160 to 195 bps on
 *     2026-09-01 → Lagoon Resorts Group's contribution margin declines.
 *  2. August 2026 GL revenue is under-booked by MUR 18,450.00 (missing accrual)
 *     → control C07 fails → GL KPIs for August are DISPUTED.
 *  3. Onboarding automation decision (DEC-2026-001) approved in March 2026 —
 *     onboarding duration falls from ~34 to ~16 days (measured outcome).
 *  4. October 2026 bank reconciliation contains a duplicate statement line, an
 *     amount difference, an unidentified receipt and an uncleared payment.
 */
import type { Tx } from '../db';
import { one, q } from '../db';
import { insertMany } from '../db-bulk';
import { dec, ZERO, sum, type Dec } from '../money';
import { addDays, addMonths, monthEnd, monthsInRange, daysBetween } from '../dates';
import { computeTxnEconomics, type PricingRule, type FeeRule, type ProcessingRule } from '../engine/fees';
import { syncKpiRegistry, runCalculation } from '../services/kpi';
import { audit } from '../audit';

export const DEMO_START = '2025-05-01';
export const DEMO_END = '2026-10-31';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Mix = 'hotel' | 'retail' | 'utility' | 'education' | 'health' | 'logistics';
interface MSpec { code: string; name: string; vertical: string; segment: string; daily: number; ticket: number; mix: Mix; mcbShare: number; activated: string; churned?: string; growth: number; saas: number; mdrAdj: number; imp: number; risk: number; pot: number; group?: string; priceLock?: string; notes?: string }

const MERCHANTS: MSpec[] = [
  { code: 'M001', name: 'Lagoon Resorts Group (DEMO)', vertical: 'hospitality', segment: 'enterprise', daily: 38, ticket: 21000, mix: 'hotel', mcbShare: 0.15, activated: '2023-03-01', growth: 0.012, saas: 15000, mdrAdj: 0, imp: 5, risk: 3, pot: 4, group: 'G-LAGOON', notes: 'Annual price review each 1 Nov; 30-day notice for MDR changes.' },
  { code: 'M002', name: 'Lagoon Beach Villas (DEMO)', vertical: 'hospitality', segment: 'mid_market', daily: 9, ticket: 16500, mix: 'hotel', mcbShare: 0.15, activated: '2023-06-01', growth: 0.01, saas: 4000, mdrAdj: 10, imp: 3, risk: 2, pot: 3, group: 'G-LAGOON' },
  { code: 'M003', name: 'Coral Bay Hotel (DEMO)', vertical: 'hospitality', segment: 'mid_market', daily: 12, ticket: 14000, mix: 'hotel', mcbShare: 0.7, activated: '2022-11-01', growth: 0.006, saas: 3500, mdrAdj: 0, imp: 3, risk: 2, pot: 3 },
  { code: 'M004', name: 'Le Morne Eco Lodge (DEMO)', vertical: 'hospitality', segment: 'sme', daily: 4, ticket: 11000, mix: 'hotel', mcbShare: 0.0, activated: '2025-08-12', growth: 0.03, saas: 1500, mdrAdj: 15, imp: 2, risk: 2, pot: 4 },
  { code: 'M005', name: 'Island Retail Holdings (DEMO)', vertical: 'retail', segment: 'enterprise', daily: 70, ticket: 2400, mix: 'retail', mcbShare: 0.8, activated: '2022-05-01', growth: 0.008, saas: 12000, mdrAdj: -25, imp: 5, risk: 2, pot: 3, priceLock: '2027-03-31', notes: 'MFN clause; MDR locked until 31 Mar 2027.' },
  { code: 'M006', name: 'Port Louis Electronics (DEMO)', vertical: 'retail', segment: 'mid_market', daily: 22, ticket: 6800, mix: 'retail', mcbShare: 0.5, activated: '2023-01-15', growth: 0.005, saas: 3000, mdrAdj: 0, imp: 3, risk: 3, pot: 3 },
  { code: 'M007', name: 'Curepipe Fashion House (DEMO)', vertical: 'retail', segment: 'sme', daily: 14, ticket: 2900, mix: 'retail', mcbShare: 0.6, activated: '2024-02-01', growth: 0.004, saas: 0, mdrAdj: 10, imp: 2, risk: 3, pot: 2 },
  { code: 'M008', name: 'Grand Baie Supermarket (DEMO)', vertical: 'retail', segment: 'mid_market', daily: 48, ticket: 1350, mix: 'retail', mcbShare: 0.9, activated: '2023-09-01', growth: 0.006, saas: 2500, mdrAdj: -10, imp: 3, risk: 2, pot: 3 },
  { code: 'M009', name: 'Ebene Book & Office (DEMO)', vertical: 'retail', segment: 'sme', daily: 8, ticket: 1900, mix: 'retail', mcbShare: 0.5, activated: '2024-04-01', churned: '2026-07-31', growth: -0.02, saas: 0, mdrAdj: 15, imp: 1, risk: 5, pot: 1 },
  { code: 'M010', name: 'Flacq Hardware (DEMO)', vertical: 'retail', segment: 'sme', daily: 10, ticket: 3600, mix: 'retail', mcbShare: 0.4, activated: '2025-11-03', growth: 0.04, saas: 0, mdrAdj: 15, imp: 2, risk: 2, pot: 4 },
  { code: 'M011', name: 'CEB Utilities Pay Desk (DEMO)', vertical: 'utilities', segment: 'enterprise', daily: 55, ticket: 2900, mix: 'utility', mcbShare: 0.6, activated: '2022-01-10', growth: 0.003, saas: 9000, mdrAdj: -20, imp: 5, risk: 1, pot: 2 },
  { code: 'M012', name: 'Central Water Billing (DEMO)', vertical: 'utilities', segment: 'enterprise', daily: 30, ticket: 1600, mix: 'utility', mcbShare: 0.5, activated: '2023-04-01', growth: 0.004, saas: 6000, mdrAdj: -15, imp: 4, risk: 1, pot: 2 },
  { code: 'M013', name: 'Island Telecom Top-up (DEMO)', vertical: 'utilities', segment: 'mid_market', daily: 40, ticket: 650, mix: 'utility', mcbShare: 0.3, activated: '2024-06-01', growth: 0.01, saas: 2000, mdrAdj: 0, imp: 3, risk: 2, pot: 3 },
  { code: 'M014', name: 'Moka International School (DEMO)', vertical: 'education', segment: 'mid_market', daily: 6, ticket: 38000, mix: 'education', mcbShare: 0.7, activated: '2023-08-01', growth: 0.003, saas: 3000, mdrAdj: -10, imp: 3, risk: 1, pot: 2 },
  { code: 'M015', name: 'Uni-Campus Mauritius (DEMO)', vertical: 'education', segment: 'mid_market', daily: 8, ticket: 21000, mix: 'education', mcbShare: 0.5, activated: '2024-01-15', growth: 0.005, saas: 2500, mdrAdj: 0, imp: 3, risk: 2, pot: 3 },
  { code: 'M016', name: 'Quatre Bornes Tuition Centre (DEMO)', vertical: 'education', segment: 'sme', daily: 5, ticket: 4200, mix: 'education', mcbShare: 0.4, activated: '2025-09-01', growth: 0.03, saas: 0, mdrAdj: 10, imp: 1, risk: 3, pot: 3 },
  { code: 'M017', name: 'Wellkin Clinic (DEMO)', vertical: 'healthcare', segment: 'mid_market', daily: 18, ticket: 5200, mix: 'health', mcbShare: 0.5, activated: '2023-02-01', growth: 0.006, saas: 3500, mdrAdj: 0, imp: 3, risk: 2, pot: 3 },
  { code: 'M018', name: 'Rose-Hill Pharmacy Chain (DEMO)', vertical: 'healthcare', segment: 'mid_market', daily: 34, ticket: 1250, mix: 'health', mcbShare: 0.7, activated: '2023-10-01', growth: 0.007, saas: 2500, mdrAdj: -5, imp: 3, risk: 2, pot: 3 },
  { code: 'M019', name: 'Vacoas Dental Group (DEMO)', vertical: 'healthcare', segment: 'sme', daily: 6, ticket: 3800, mix: 'health', mcbShare: 0.4, activated: '2026-02-02', growth: 0.04, saas: 0, mdrAdj: 15, imp: 2, risk: 2, pot: 4 },
  { code: 'M020', name: 'Indian Ocean Freight (DEMO)', vertical: 'logistics', segment: 'mid_market', daily: 7, ticket: 18500, mix: 'logistics', mcbShare: 0.3, activated: '2023-05-01', growth: 0.005, saas: 3000, mdrAdj: 0, imp: 3, risk: 3, pot: 3 },
  { code: 'M021', name: 'Express Courier MU (DEMO)', vertical: 'logistics', segment: 'sme', daily: 16, ticket: 950, mix: 'logistics', mcbShare: 0.6, activated: '2024-07-01', growth: 0.006, saas: 0, mdrAdj: 10, imp: 2, risk: 2, pot: 3 },
  { code: 'M022', name: 'Airport Duty Free (DEMO)', vertical: 'retail', segment: 'enterprise', daily: 26, ticket: 7800, mix: 'hotel', mcbShare: 0.2, activated: '2023-11-01', growth: 0.009, saas: 6000, mdrAdj: -10, imp: 4, risk: 3, pot: 3 },
  { code: 'M023', name: 'Tamarin Surf School (DEMO)', vertical: 'other_sme', segment: 'micro', daily: 3, ticket: 3500, mix: 'hotel', mcbShare: 0.0, activated: '2025-06-01', growth: 0.02, saas: 0, mdrAdj: 20, imp: 1, risk: 3, pot: 2 },
  { code: 'M024', name: 'Chamarel Rum Tours (DEMO)', vertical: 'other_sme', segment: 'sme', daily: 5, ticket: 4800, mix: 'hotel', mcbShare: 0.1, activated: '2024-03-01', growth: 0.008, saas: 0, mdrAdj: 15, imp: 2, risk: 2, pot: 3 },
  { code: 'M025', name: 'Mahebourg Fish Market Co-op (DEMO)', vertical: 'other_sme', segment: 'micro', daily: 12, ticket: 700, mix: 'retail', mcbShare: 0.8, activated: '2025-03-01', growth: 0.015, saas: 0, mdrAdj: 20, imp: 1, risk: 3, pot: 2 },
  { code: 'M026', name: 'Bagatelle Cinema (DEMO)', vertical: 'other_sme', segment: 'mid_market', daily: 20, ticket: 900, mix: 'retail', mcbShare: 0.5, activated: '2024-09-01', growth: 0.004, saas: 1500, mdrAdj: 0, imp: 2, risk: 2, pot: 2 },
  { code: 'M027', name: 'Black River Golf Club (DEMO)', vertical: 'hospitality', segment: 'sme', daily: 4, ticket: 9500, mix: 'hotel', mcbShare: 0.5, activated: '2026-05-04', growth: 0.03, saas: 1500, mdrAdj: 5, imp: 2, risk: 2, pot: 4 },
  { code: 'M028', name: 'Phoenix Auto Parts (DEMO)', vertical: 'retail', segment: 'sme', daily: 7, ticket: 5400, mix: 'retail', mcbShare: 0.6, activated: '2026-07-01', growth: 0.04, saas: 0, mdrAdj: 15, imp: 2, risk: 2, pot: 4 },
  { code: 'M029', name: 'Riviere du Rempart Bakery (DEMO)', vertical: 'other_sme', segment: 'micro', daily: 9, ticket: 450, mix: 'retail', mcbShare: 0.9, activated: '2025-12-01', growth: 0.02, saas: 0, mdrAdj: 25, imp: 1, risk: 3, pot: 2 },
  { code: 'M030', name: 'Belle Mare Spa Collection (DEMO)', vertical: 'hospitality', segment: 'mid_market', daily: 7, ticket: 8200, mix: 'hotel', mcbShare: 0.0, activated: '2024-10-01', growth: 0.006, saas: 2000, mdrAdj: 5, imp: 3, risk: 3, pot: 3 },
];

const MIX: Record<Mix, { methods: [string, number][]; intl: number; products: [string, number][]; fx: number }> = {
  hotel: { methods: [['visa', 0.5], ['mastercard', 0.4], ['amex', 0.1]], intl: 0.72, products: [['ECOM', 0.6], ['POS', 0.4]], fx: 0.35 },
  retail: { methods: [['visa', 0.34], ['mastercard', 0.3], ['maucas_qr', 0.14], ['juice', 0.12], ['blink', 0.05], ['myt_money', 0.05]], intl: 0.08, products: [['POS', 0.6], ['ECOM', 0.25], ['SOFTPOS', 0.15]], fx: 0.02 },
  utility: { methods: [['visa', 0.3], ['mastercard', 0.2], ['maucas_qr', 0.25], ['juice', 0.15], ['myt_money', 0.1]], intl: 0.02, products: [['ECOM', 0.55], ['PAYLINK', 0.45]], fx: 0 },
  education: { methods: [['visa', 0.35], ['mastercard', 0.25], ['juice', 0.2], ['maucas_qr', 0.2]], intl: 0.05, products: [['PAYLINK', 0.7], ['ECOM', 0.3]], fx: 0.02 },
  health: { methods: [['visa', 0.4], ['mastercard', 0.3], ['juice', 0.15], ['maucas_qr', 0.1], ['blink', 0.05]], intl: 0.05, products: [['POS', 0.55], ['SOFTPOS', 0.3], ['ECOM', 0.15]], fx: 0.01 },
  logistics: { methods: [['visa', 0.5], ['mastercard', 0.4], ['juice', 0.1]], intl: 0.3, products: [['ECOM', 0.8], ['PAYLINK', 0.2]], fx: 0.2 },
};
const MDR_BASE: Record<Mix, { card: number; intl: number; alt: number }> = {
  hotel: { card: 245, intl: 295, alt: 95 }, retail: { card: 190, intl: 260, alt: 90 }, utility: { card: 150, intl: 230, alt: 60 },
  education: { card: 170, intl: 250, alt: 70 }, health: { card: 200, intl: 270, alt: 90 }, logistics: { card: 215, intl: 290, alt: 90 },
};

function pickW<T extends string>(r: () => number, items: [T, number][]): T {
  const x = r(); let acc = 0; for (const [k, w] of items) { acc += w; if (x <= acc) return k; } return items[items.length - 1][0];
}
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export async function seedDemoTenant(tx: Tx, tenantId: string, users: Record<string, string>, opts: { scale?: number; withCalc?: boolean } = {}) {
  const r = rng(20261031);
  const scale = opts.scale ?? 1;
  const T = tenantId;
  const t0 = Date.now(); const tick = (l: string) => { if (process.env.SEED_VERBOSE) console.log(`[seed +${((Date.now() - t0) / 1000).toFixed(1)}s] ${l}`); };
  const userCeo = users.ceo, userCfo = users.cfo, userFin = users.finance;

  // ---------------- reference data ----------------
  const ins = async (table: string, cols: string[], rows: unknown[][]) => insertMany(tx, table, ['tenant_id', ...cols], rows.map((x) => [T, ...x]), 'id, ' + (cols.includes('code') ? 'code' : cols[0]));
  const idMap = (rows: any[], key = 'code') => Object.fromEntries(rows.map((x) => [x[key], x.id])) as Record<string, string>;

  const acq = idMap(await ins('acquirers', ['code', 'name', 'country'], [['MCB', 'MCB — The Mauritius Commercial Bank', 'MU'], ['SBM', 'SBM Bank (Mauritius)', 'MU'], ['AFRASIA', 'AfrAsia Bank', 'MU'], ['EMTEL', 'Emtel (blink)', 'MU'], ['MT', 'Mauritius Telecom (my.t money)', 'MU']]));
  const pm = idMap(await ins('payment_methods', ['code', 'name', 'category', 'scheme'], [
    ['visa', 'Visa', 'card', 'visa'], ['mastercard', 'Mastercard', 'card', 'mastercard'], ['amex', 'American Express', 'card', 'amex'],
    ['maucas_qr', 'MauCAS QR (POP)', 'qr', 'maucas'], ['juice', 'MCB Juice', 'wallet', 'juice'], ['blink', 'blink by Emtel', 'wallet', 'blink'], ['myt_money', 'my.t money', 'wallet', 'myt']]));
  const prod = idMap(await ins('products', ['code', 'name', 'channel', 'is_transactional'], [
    ['ECOM', 'E-commerce gateway', 'ecommerce', true], ['POS', 'POS card acceptance', 'pos', true], ['SOFTPOS', 'SoftPOS', 'softpos', true],
    ['QR', 'QR payments (MauCAS)', 'qr', true], ['WALLET', 'Digital wallets', 'wallet', true], ['PAYLINK', 'Payment links', 'links', true],
    ['ORCH', 'Payment orchestration', 'orchestration', false], ['PAYOUTS', 'Payouts', 'payouts', false], ['RECON', 'Reconciliation services', 'saas', false], ['SAAS', 'SaaS & value-added services', 'saas', false]]));
  const vert = idMap(await ins('verticals', ['code', 'name'], [['hospitality', 'Hospitality'], ['retail', 'Retail'], ['utilities', 'Utilities'], ['education', 'Education'], ['healthcare', 'Healthcare'], ['logistics', 'Logistics'], ['other_sme', 'Other SMEs']]));
  const grp = idMap(await ins('merchant_groups', ['code', 'name'], [['G-LAGOON', 'Lagoon Hospitality Group (DEMO)']]));
  const dept = idMap(await ins('departments', ['code', 'name'], [['TECH', 'Technology'], ['OPS', 'Operations'], ['SALES', 'Sales & Partnerships'], ['FIN', 'Finance & Admin'], ['EXEC', 'Executive'], ['RISK', 'Risk & Compliance']]));

  // FX (DEMO reference rates, monthly)
  const months = monthsInRange(DEMO_START, DEMO_END);
  const fxRows: unknown[][] = [];
  months.forEach((m, i) => {
    const usd = dec('45.20').plus(dec(i).times('0.055')).plus(dec(Math.sin(i / 2)).times('0.25')).toDecimalPlaces(4);
    const eur = usd.times('1.085').toDecimalPlaces(4); const gbp = usd.times('1.27').toDecimalPlaces(4);
    for (const [c, v] of [['USD', usd], ['EUR', eur], ['GBP', gbp]] as const) fxRows.push([m, c, 'MUR', v.toFixed(10), 'DEMO reference rate (synthetic)']);
  });
  await insertMany(tx, 'exchange_rates', ['tenant_id', 'rate_date', 'from_ccy', 'to_ccy', 'rate', 'source'], fxRows.map((x) => [T, ...x]));
  const fx = (date: string, ccy: string): Dec => {
    const i = Math.max(0, months.indexOf(date.slice(0, 7) + '-01'));
    const row = fxRows.filter((x) => x[1] === ccy)[i];
    return dec(row[3] as string);
  };

  // Chart of accounts
  const coa: [string, string, string, string | null, string | null, string | null, string | null][] = [
    ['1000', 'Bank — operating accounts', 'asset', null, null, null, null], ['1010', 'Bank — safeguarded merchant funds', 'asset', null, null, null, null],
    ['1100', 'Trade receivables', 'asset', null, null, null, null], ['1200', 'Settlement fee clearing', 'asset', null, null, null, null], ['1500', 'Property, plant & equipment', 'asset', null, null, null, null],
    ['2000', 'Trade payables', 'liability', null, null, null, null], ['2100', 'Accrued payroll', 'liability', null, null, null, null], ['2200', 'Tax payable', 'liability', null, null, null, null], ['2300', 'Bank loan', 'liability', null, null, null, null], ['2400', 'Merchant funds payable', 'liability', null, null, null, null],
    ['3000', 'Share capital & reserves', 'equity', null, null, null, null],
    ['4000', 'Payment processing revenue (net of wholesale)', 'revenue', 'revenue', null, null, 'TXN'], ['4100', 'SaaS & value-added services revenue', 'revenue', 'revenue', null, null, 'SAAS'], ['4200', 'Payouts & reconciliation services revenue', 'revenue', 'revenue', null, null, 'OTHER'],
    ['5000', 'Direct processing & gateway costs', 'expense', 'cost_of_sales', 'payment_processing', 'variable', null],
    ['6000', 'Payroll & benefits', 'expense', 'opex', 'payroll', 'fixed', null], ['6100', 'Cloud infrastructure', 'expense', 'opex', 'cloud', 'semi', null], ['6200', 'Banking services', 'expense', 'opex', 'banking', 'semi', null],
    ['6300', 'Software subscriptions', 'expense', 'opex', 'software', 'fixed', null], ['6400', 'Compliance & regulatory', 'expense', 'opex', 'compliance', 'fixed', null], ['6500', 'Information security', 'expense', 'opex', 'security', 'fixed', null],
    ['6600', 'Sales & marketing', 'expense', 'opex', 'sales_marketing', 'semi', null], ['6700', 'Administration & office', 'expense', 'opex', 'admin', 'fixed', null], ['6800', 'Professional services', 'expense', 'opex', 'professional', 'fixed', null], ['6900', 'Research & development', 'expense', 'opex', 'rnd', 'fixed', null],
    ['7000', 'Depreciation & amortisation', 'expense', 'd_and_a', 'depreciation', 'fixed', null], ['8000', 'Finance income', 'revenue', 'finance_income', null, null, null], ['8100', 'Finance costs', 'expense', 'finance_costs', 'finance', 'fixed', null], ['9000', 'Income tax expense', 'expense', 'tax', null, null, null],
  ];
  const acct = idMap(await insertMany(tx, 'chart_of_accounts', ['tenant_id', 'code', 'name', 'account_type', 'pl_line', 'cost_category', 'cost_behaviour', 'revenue_stream'], coa.map((c) => [T, ...c]), 'id, code'));

  // Merchants
  const merchRows = await insertMany(tx, 'merchants', ['tenant_id', 'code', 'name', 'group_id', 'vertical_id', 'segment', 'status', 'onboarding_started_at', 'activated_at', 'churned_at', 'commercial_importance', 'churn_risk', 'growth_potential', 'contract_notes', 'price_locked_until', 'contract_end_date'],
    MERCHANTS.map((m) => [T, m.code, m.name, m.group ? grp[m.group] : null, vert[m.vertical], m.segment, m.churned ? 'churned' : 'active', addDays(m.activated, -(m.activated >= '2026-03-15' ? 16 : 34)), m.activated, m.churned ?? null, m.imp, m.risk, m.pot, m.notes ?? null, m.priceLock ?? null, '2027-12-31']), 'id, code');
  const mid = idMap(merchRows);

  // Pricing agreements (effective-dated)
  const pricingRows: unknown[][] = [];
  for (const m of MERCHANTS) {
    const b = MDR_BASE[m.mix]; const from = m.activated < '2025-01-01' ? '2025-01-01' : m.activated;
    pricingRows.push([T, mid[m.code], null, 'any', b.card + m.mdrAdj, '0', 'MUR', m.saas, from, null, `PA-${m.code}-01`, userCfo]);
    pricingRows.push([T, mid[m.code], null, 'international', b.intl + m.mdrAdj, '0', 'MUR', 0, from, null, `PA-${m.code}-01-INTL`, userCfo]);
    for (const alt of ['maucas_qr', 'juice', 'blink', 'myt_money']) pricingRows.push([T, mid[m.code], pm[alt], 'any', b.alt + Math.round(m.mdrAdj / 2), '0', 'MUR', 0, from, null, `PA-${m.code}-01-ALT`, userCfo]);
  }
  await insertMany(tx, 'pricing_agreements', ['tenant_id', 'merchant_id', 'payment_method_id', 'card_region', 'mdr_bps', 'fixed_fee', 'fee_currency', 'monthly_saas_fee', 'effective_from', 'effective_to', 'contract_ref', 'approved_by'], pricingRows);

  // Fee schedules (acquirer wholesale)
  const fs: unknown[][] = [
    [acq.MCB, null, 'any', 128, 'MCB-FS-2025'], [acq.MCB, null, 'international', 178, 'MCB-FS-2025'], [acq.MCB, pm.amex, 'any', 235, 'MCB-FS-2025-AMEX'], [acq.MCB, pm.juice, 'any', 45, 'MCB-JUICE-2025'], [acq.MCB, pm.maucas_qr, 'any', 35, 'MCB-MAUCAS-2025'],
    [acq.SBM, null, 'any', 122, 'SBM-FS-2025'], [acq.SBM, pm.amex, 'any', 240, 'SBM-FS-2025-AMEX'], [acq.SBM, pm.maucas_qr, 'any', 35, 'SBM-MAUCAS-2025'], [acq.SBM, pm.juice, 'any', 48, 'SBM-JUICE-2025'],
    [acq.AFRASIA, null, 'any', 120, 'AFR-FS-2025'], [acq.AFRASIA, null, 'international', 172, 'AFR-FS-2025'],
    [acq.EMTEL, pm.blink, 'any', 60, 'EMTEL-2025'], [acq.MT, pm.myt_money, 'any', 62, 'MT-2025'],
  ];
  const feeRows = fs.map(([a, p, reg, bps, ref]) => [T, a, p, reg, bps, '0', 'MUR', '2025-01-01', null, ref]);
  // Storyline 1: SBM international increase from 1 Sep 2026
  feeRows.push([T, acq.SBM, null, 'international', 160, '0', 'MUR', '2025-01-01', '2026-08-31', 'SBM-FS-2025-INTL']);
  feeRows.push([T, acq.SBM, null, 'international', 195, '0', 'MUR', '2026-09-01', null, 'SBM-FS-2026-09-INTL (scheme pass-through notice 14-Jul-2026)']);
  await insertMany(tx, 'fee_schedules', ['tenant_id', 'acquirer_id', 'payment_method_id', 'card_region', 'wholesale_bps', 'fixed_fee', 'fee_currency', 'effective_from', 'effective_to', 'schedule_ref'], feeRows);
  await insertMany(tx, 'processing_cost_rates', ['tenant_id', 'product_id', 'cost_per_txn', 'cost_bps', 'currency', 'effective_from', 'effective_to', 'basis'], [
    [T, null, '2.10', '3', 'MUR', '2025-01-01', '2026-02-28', 'DEMO estimate: (cloud + gateway licence invoices) ÷ attempts, FY2025 average'],
    [T, null, '1.95', '3', 'MUR', '2026-03-01', null, 'DEMO estimate: re-based after March 2026 cloud optimisation'],
  ]);

  // Load rules for the fee engine (same engine used by imports)
  const pricing = await q<PricingRule>(tx, 'SELECT id, merchant_id, payment_method_id, card_region, mdr_bps::text, fixed_fee::text, effective_from, effective_to FROM pricing_agreements');
  const fees = await q<FeeRule>(tx, 'SELECT id, acquirer_id, payment_method_id, card_region, wholesale_bps::text, fixed_fee::text, effective_from, effective_to FROM fee_schedules');
  const procRules = await q<ProcessingRule>(tx, 'SELECT product_id, cost_per_txn::text, cost_bps::text, effective_from, effective_to FROM processing_cost_rates');

  // ---------------- transactions ----------------
  const txCols = ['tenant_id', 'external_ref', 'merchant_id', 'product_id', 'acquirer_id', 'payment_method_id', 'card_scheme', 'card_region', 'country', 'status', 'txn_currency', 'settlement_currency', 'amount', 'fx_rate_to_base', 'amount_base', 'mdr_fee_base', 'wholesale_fee_base', 'processing_cost_base', 'pricing_agreement_id', 'fee_schedule_id', 'event_at', 'processed_at', 'settlement_date', 'accounting_date', 'is_demo'];
  let buf: unknown[][] = []; let seq = 0;
  const monthAgg = new Map<string, { mdr: Dec; wh: Dec; proc: Dec; byProd: Map<string, Dec> }>();
  const weekSweep = new Map<string, Dec>();
  const flush = async () => { if (buf.length) { await insertMany(tx, 'transactions', txCols, buf); buf = []; } };
  const totalDays = daysBetween(DEMO_START, DEMO_END) + 1;
  for (let d = 0; d < totalDays; d++) {
    const date = addDays(DEMO_START, d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const monthIdx = months.indexOf(date.slice(0, 7) + '-01');
    const seasonal = 1 + 0.18 * Math.cos(((monthIdx + 4) / 12) * 2 * Math.PI); // peak Dec/Jan (tourism)
    for (const m of MERCHANTS) {
      if (date < m.activated || (m.churned && date > m.churned)) continue;
      const mix = MIX[m.mix];
      const age = Math.max(0, daysBetween(DEMO_START, date) / 30.4);
      const weekend = dow === 0 ? 0.55 : dow === 6 ? 0.85 : 1;
      const tourismFactor = m.mix === 'hotel' ? seasonal : 1 + (seasonal - 1) * 0.25;
      const lam = m.daily * scale * Math.pow(1 + m.growth, age) * weekend * tourismFactor;
      const n = Math.max(0, Math.round(lam + (r() - 0.5) * Math.sqrt(lam) * 2));
      for (let i = 0; i < n; i++) {
        seq++;
        const method = pickW(r, mix.methods);
        const isCard = ['visa', 'mastercard', 'amex'].includes(method);
        const region = isCard ? (r() < mix.intl ? 'international' : 'domestic') : 'na';
        let product = pickW(r, mix.products);
        if (method === 'maucas_qr') product = 'QR'; else if (!isCard) product = 'WALLET';
        let acquirer: string;
        if (method === 'juice' || method === 'maucas_qr') acquirer = r() < 0.75 ? 'MCB' : 'SBM';
        else if (method === 'blink') acquirer = 'EMTEL'; else if (method === 'myt_money') acquirer = 'MT';
        else acquirer = r() < m.mcbShare ? 'MCB' : (r() < 0.85 ? 'SBM' : 'AFRASIA');
        if (method === 'maucas_qr' && acquirer === 'SBM' && r() < 0.0) acquirer = 'SBM';
        // failure rates: SBM incident 2026-09-17/18
        let failP = isCard ? 0.045 : 0.03;
        if (acquirer === 'SBM' && (date === '2026-09-17' || date === '2026-09-18')) failP = 0.35;
        const st = r() < failP ? 'failed' : r() < 0.004 ? 'refunded' : 'success';
        const ticket = m.ticket * Math.exp((r() - 0.5) * 1.1) * (region === 'international' ? 1.25 : 1);
        const baseAmt = dec(Math.max(50, ticket).toFixed(2));
        let ccy = 'MUR'; let rate = dec(1); let amount = baseAmt; let amountBase = baseAmt;
        if (region === 'international' && r() < mix.fx) {
          ccy = r() < 0.6 ? 'EUR' : r() < 0.7 ? 'USD' : 'GBP'; rate = fx(date, ccy);
          amount = baseAmt.div(rate).toDecimalPlaces(2); amountBase = amount.times(rate).toDecimalPlaces(4);
        }
        const econ = computeTxnEconomics({ merchant_id: mid[m.code], acquirer_id: acq[acquirer], payment_method_id: pm[method], product_id: prod[product], card_region: region === 'na' ? 'domestic' : region, status: st, amount_base: amountBase, accounting_date: date }, pricing, fees, procRules);
        const hh = Math.floor(7 + r() * 15), mm = Math.floor(r() * 60), ss = Math.floor(r() * 60);
        const eventAt = `${date}T${pad(hh)}:${pad(mm)}:${pad(ss)}+04:00`;
        const settle = addDays(date, dow === 5 ? 3 : dow === 6 ? 2 : 1);
        const mdr = econ.mdr.toDecimalPlaces(4), wh = econ.wholesale.toDecimalPlaces(4), pc = econ.processing.toDecimalPlaces(4);
        buf.push([T, `DEMO-${date.replace(/-/g, '')}-${pad(seq, 7)}`, mid[m.code], prod[product], acq[acquirer], pm[method], isCard ? method : null, region === 'na' ? 'domestic' : region, region === 'international' ? (ccy === 'EUR' ? 'FR' : ccy === 'GBP' ? 'GB' : 'US') : 'MU', st, ccy, 'MUR', amount.toFixed(2), rate.toFixed(10), amountBase.toFixed(4), mdr.toFixed(4), wh.toFixed(4), pc.toFixed(4), econ.pricingId, econ.feeScheduleId, eventAt, eventAt, settle, date, true]);
        const key = date.slice(0, 7) + '-01';
        const a = monthAgg.get(key) ?? { mdr: ZERO, wh: ZERO, proc: ZERO, byProd: new Map() };
        a.mdr = a.mdr.plus(mdr); a.wh = a.wh.plus(wh); a.proc = a.proc.plus(pc);
        a.byProd.set(product, (a.byProd.get(product) ?? ZERO).plus(mdr.minus(wh)));
        monthAgg.set(key, a);
        const wk = weekOf(settle); weekSweep.set(wk, (weekSweep.get(wk) ?? ZERO).plus(mdr.minus(wh)));
        if (buf.length >= 2400) await flush();
      }
    }
  }
  await flush();

  tick('transactions inserted');
  // ---------------- SaaS by month ----------------
  const saasByMonth = new Map<string, Dec>();
  const saasByMerchantMonth: { m: MSpec; month: string; fee: Dec }[] = [];
  for (const mo of months) {
    let s = ZERO;
    for (const m of MERCHANTS) {
      if (!m.saas) continue;
      if (m.activated > monthEnd(mo) || (m.churned && m.churned < mo)) continue;
      s = s.plus(m.saas); saasByMerchantMonth.push({ m, month: mo, fee: dec(m.saas) });
    }
    saasByMonth.set(mo, s);
  }

  // ---------------- General ledger ----------------
  const gl: unknown[][] = [];
  const glCols = ['tenant_id', 'journal_ref', 'line_no', 'entry_date', 'period', 'account_id', 'department_id', 'product_id', 'description', 'currency', 'debit', 'credit', 'fx_rate_to_base', 'debit_base', 'credit_base', 'source_system', 'is_demo'];
  const line = (j: string, n: number, date: string, account: string, debit: Dec, credit: Dec, desc: string, deptId: string | null = null, prodId: string | null = null) =>
    gl.push([T, j, n, date, date.slice(0, 7) + '-01', acct[account], deptId, prodId, desc, 'MUR', debit.toFixed(4), credit.toFixed(4), '1', debit.toFixed(4), credit.toFixed(4), 'DEMO generator', true]);
  const opexPlan: Record<string, { acc: string; base: number; growth: number; vol: number; dept: string }> = {
    payroll_tech: { acc: '6000', base: 145000, growth: 0.009, vol: 0.01, dept: 'TECH' }, payroll_ops: { acc: '6000', base: 78000, growth: 0.008, vol: 0.01, dept: 'OPS' },
    payroll_sales: { acc: '6000', base: 52000, growth: 0.01, vol: 0.02, dept: 'SALES' }, payroll_fin: { acc: '6000', base: 41000, growth: 0.006, vol: 0.01, dept: 'FIN' }, payroll_exec: { acc: '6000', base: 60000, growth: 0.004, vol: 0, dept: 'EXEC' },
    cloud: { acc: '6100', base: 39000, growth: 0.012, vol: 0.05, dept: 'TECH' }, banking: { acc: '6200', base: 9500, growth: 0.005, vol: 0.06, dept: 'FIN' },
    software: { acc: '6300', base: 21500, growth: 0.006, vol: 0.03, dept: 'TECH' }, compliance: { acc: '6400', base: 14500, growth: 0.004, vol: 0.12, dept: 'RISK' },
    security: { acc: '6500', base: 12500, growth: 0.006, vol: 0.05, dept: 'TECH' }, marketing: { acc: '6600', base: 28000, growth: 0.006, vol: 0.18, dept: 'SALES' },
    admin: { acc: '6700', base: 17500, growth: 0.004, vol: 0.06, dept: 'FIN' }, professional: { acc: '6800', base: 14000, growth: 0.003, vol: 0.35, dept: 'FIN' }, rnd: { acc: '6900', base: 19000, growth: 0.008, vol: 0.1, dept: 'TECH' },
  };
  const monthlyOpex = new Map<string, Record<string, Dec>>();
  const actualPayroll = new Map<string, Dec>();
  for (const [i, mo] of months.entries()) {
    const end = monthEnd(mo); const a = monthAgg.get(mo)!;
    const yyyymm = mo.slice(0, 7).replace('-', '');
    // Revenue
    let ln = 1; const jr = `JRN-REV-${yyyymm}`;
    let revTotal = ZERO;
    for (const [p, v] of [...a.byProd.entries()].sort()) {
      let amount = v.toDecimalPlaces(2);
      if (mo === '2026-08-01' && p === 'ECOM') amount = amount.minus('18450.00'); // Storyline 2: missing accrual
      line(jr, ln++, end, '4000', ZERO, amount, `Net payment revenue — ${p} (fee engine month-end posting)`, null, prod[p]); revTotal = revTotal.plus(amount);
    }
    const saas = saasByMonth.get(mo)!; line(jr, ln++, end, '4100', ZERO, saas, 'SaaS subscriptions', null, prod.SAAS); revTotal = revTotal.plus(saas);
    const other = dec(Math.round(34000 + i * 900 + r() * 6000)); line(jr, ln++, end, '4200', ZERO, other.times('0.6').toDecimalPlaces(2), 'Payout fees', null, prod.PAYOUTS); line(jr, ln++, end, '4200', ZERO, other.minus(other.times('0.6').toDecimalPlaces(2)), 'Reconciliation service fees', null, prod.RECON);
    revTotal = revTotal.plus(other);
    line(jr, ln++, end, '1200', revTotal, ZERO, 'Revenue clearing');
    // Cost of sales (actual processing invoices ≈ model × noise)
    const cos = a.proc.times(dec(0.97 + r() * 0.06)).toDecimalPlaces(2);
    line(`JRN-COS-${yyyymm}`, 1, end, '5000', cos, ZERO, 'Gateway licence & cloud processing (direct)', dept.TECH);
    line(`JRN-COS-${yyyymm}`, 2, end, '2000', ZERO, cos, 'Accounts payable');
    // Opex
    const opex: Record<string, Dec> = {}; let ol = 1; let opexTotal = ZERO;
    for (const [k, p] of Object.entries(opexPlan)) {
      let v = p.base * Math.pow(1 + p.growth, i) * (1 + (r() - 0.5) * 2 * p.vol);
      if (k === 'professional' && (mo === '2025-09-01' || mo === '2026-09-01')) v *= 2.6;   // audit fees
      if (k === 'marketing' && mo === '2026-06-01') v *= 1.8;                              // expo
      if (k === 'compliance' && mo === '2026-07-01') v *= 2.2;                             // PCI assessment
      if (k === 'cloud' && mo >= '2026-03-01') v *= 0.92;                                  // cloud optimisation
      const amt = dec(v.toFixed(2)); opex[k] = amt; opexTotal = opexTotal.plus(amt);
      line(`JRN-OPX-${yyyymm}`, ol++, end, p.acc, amt, ZERO, k.replace('_', ' '), dept[p.dept]);
    }
    const payroll = ['payroll_tech', 'payroll_ops', 'payroll_sales', 'payroll_fin', 'payroll_exec'].reduce((s, k) => s.plus(opex[k]), ZERO);
    actualPayroll.set(mo, payroll);
    line(`JRN-OPX-${yyyymm}`, ol++, end, '2100', ZERO, payroll, 'Accrued payroll');
    line(`JRN-OPX-${yyyymm}`, ol++, end, '2000', ZERO, opexTotal.minus(payroll), 'Accounts payable');
    monthlyOpex.set(mo, opex);
    const da = dec(24500 + (mo >= '2026-02-01' ? 10500 : 0) + (mo >= '2026-06-01' ? 4200 : 0));
    line(`JRN-DA-${yyyymm}`, 1, end, '7000', da, ZERO, 'Depreciation & amortisation'); line(`JRN-DA-${yyyymm}`, 2, end, '1500', ZERO, da, 'Accumulated depreciation');
    const fi = dec((1800 + r() * 600).toFixed(2)); const fc = dec((6200 - i * 120).toFixed(2));
    line(`JRN-FIN-${yyyymm}`, 1, end, '1000', fi, ZERO, 'Interest received'); line(`JRN-FIN-${yyyymm}`, 2, end, '8000', ZERO, fi, 'Finance income');
    line(`JRN-FIN-${yyyymm}`, 3, end, '8100', fc, ZERO, 'Loan interest'); line(`JRN-FIN-${yyyymm}`, 4, end, '1000', ZERO, fc, 'Bank');
    const pbt = revTotal.minus(cos).minus(opexTotal).minus(da).plus(fi).minus(fc);
    const tax = pbt.gt(0) ? pbt.times('0.15').toDecimalPlaces(2) : ZERO;
    if (tax.gt(0)) { line(`JRN-TAX-${yyyymm}`, 1, end, '9000', tax, ZERO, 'Income tax provision (15 % — verify with tax adviser)'); line(`JRN-TAX-${yyyymm}`, 2, end, '2200', ZERO, tax, 'Tax payable'); }
  }
  await insertMany(tx, 'gl_entries', glCols, gl);

  tick('gl inserted');
  // ---------------- Customer invoices (SaaS & services) ----------------
  const invRows: unknown[][] = []; let invSeq = 0;
  const payBehaviour = (m: MSpec) => (m.code === 'M006' ? 38 : m.code === 'M020' ? 52 : m.code === 'M009' ? 95 : m.segment === 'enterprise' ? 8 : 18);
  for (const { m, month, fee } of saasByMerchantMonth) {
    invSeq++;
    const issue = monthEnd(month); const due = addDays(issue, 30);
    const delay = payBehaviour(m);
    let paid: string | null = addDays(due, delay - 10 + Math.round((r() - 0.5) * 8));
    if (paid > DEMO_END) paid = null;
    const disputed = m.code === 'M001' && month === '2026-09-01';
    if (disputed) paid = null;
    if (m.code === 'M009' && month >= '2026-04-01') paid = null; // churned merchant, unpaid
    invRows.push([T, `INV-${month.slice(0, 7).replace('-', '')}-${pad(invSeq, 4)}`, mid[m.code], issue, due, 'MUR', fee.toFixed(2), paid ? fee.toFixed(2) : '0', '1', `SaaS subscription ${month.slice(0, 7)}`, paid ? 'paid' : 'open', disputed, disputed ? 'Merchant disputes reconciliation-module charges pending SLA credit review' : null, paid ? 'none' : (daysBetween(due, DEMO_END) > 60 ? 'escalated' : daysBetween(due, DEMO_END) > 0 ? 'reminded' : 'none'), paid, true]);
  }
  // Integration / setup invoices
  for (const m of MERCHANTS.filter((x) => x.activated >= '2025-05-01')) {
    invSeq++; const issue = addDays(m.activated, 3); const due = addDays(issue, 30);
    const paid = addDays(due, 5) <= DEMO_END ? addDays(due, Math.round(r() * 20) - 5) : null;
    invRows.push([T, `INV-SETUP-${m.code}`, mid[m.code], issue, due, 'MUR', '25000.00', paid ? '25000.00' : '0', '1', 'Integration & onboarding fee', paid ? 'paid' : 'open', false, null, 'none', paid, true]);
  }
  await insertMany(tx, 'customer_invoices', ['tenant_id', 'number', 'merchant_id', 'issue_date', 'due_date', 'currency', 'amount', 'amount_paid', 'fx_rate_to_base', 'description', 'status', 'disputed', 'dispute_reason', 'collection_status', 'paid_date', 'is_demo'], invRows);
  await insertMany(tx, 'collection_policies', ['tenant_id', 'days_overdue', 'action', 'template', 'requires_approval'], [
    [T, 1, 'reminder', 'Dear {{merchant}}, invoice {{number}} for {{amount}} was due on {{due_date}}. Kindly arrange payment.', true],
    [T, 15, 'second_reminder', 'Second reminder: invoice {{number}} ({{amount}}) is {{days}} days overdue.', true],
    [T, 45, 'escalation', 'Escalation to account owner and merchant finance director for invoice {{number}}.', true],
    [T, 90, 'legal_review', 'Refer invoice {{number}} to legal review; consider service suspension per contract.', true],
  ]);

  // ---------------- Suppliers & payables ----------------
  const suppliers = idMap(await ins('suppliers', ['code', 'name', 'category', 'payment_terms_days', 'currency', 'bank_account_masked', 'is_critical'], [
    ['S01', 'CloudHost Indian Ocean Ltd (DEMO)', 'cloud', 30, 'MUR', '****4411', true], ['S02', 'GatewaySoft Licensing (DEMO)', 'payment_processing', 30, 'MUR', '****9921', true],
    ['S03', 'SecureOps Mauritius (DEMO)', 'security', 30, 'MUR', '****1180', true], ['S04', 'Ebene Legal & Compliance (DEMO)', 'compliance', 45, 'MUR', '****7712', false],
    ['S05', 'Island Audit Partners (DEMO)', 'professional', 30, 'MUR', '****3349', false], ['S06', 'Brightside Marketing (DEMO)', 'sales_marketing', 30, 'MUR', '****5521', false],
    ['S07', 'SaaS Stack Subscriptions (DEMO)', 'software', 15, 'MUR', '****6630', false], ['S08', 'Cybercity Office Services (DEMO)', 'admin', 30, 'MUR', '****8812', false],
    ['S09', 'R&D Contractors Pool (DEMO)', 'rnd', 30, 'MUR', '****2290', false], ['S10', 'Bank Charges Clearing (DEMO)', 'banking', 0, 'MUR', null, false]]));
  const supFor: Record<string, [string, string]> = { cloud: ['S01', '6100'], security: ['S03', '6500'], compliance: ['S04', '6400'], professional: ['S05', '6800'], marketing: ['S06', '6600'], software: ['S07', '6300'], admin: ['S08', '6700'], rnd: ['S09', '6900'] };
  const siRows: unknown[][] = []; let siSeq = 0;
  for (const mo of months) {
    const opex = monthlyOpex.get(mo)!; const end = monthEnd(mo);
    const cosAmt = (gl.find((g) => g[1] === `JRN-COS-${mo.slice(0, 7).replace('-', '')}` && g[2] === 1) as any)[10];
    const items: [string, string, string][] = [['S02', '5000', cosAmt], ...Object.entries(supFor).map(([k, [s, a]]) => [s, a, opex[k].toFixed(2)] as [string, string, string])];
    for (const [s, a, amt] of items) {
      siSeq++;
      const terms = s === 'S04' ? 45 : s === 'S07' ? 15 : 30;
      const invDate = addDays(end, -2); const due = addDays(invDate, terms);
      const recent = due >= '2026-10-15';
      let status = 'paid', paid: string | null = addDays(due, Math.round(r() * 6) - 3), approvedBy: string | null = userCfo, scheduled: string | null = null;
      if (paid > DEMO_END || recent) {
        paid = null;
        const x = r(); status = x < 0.35 ? 'received' : x < 0.7 ? 'approved' : 'scheduled'; approvedBy = status === 'received' ? null : userCfo; scheduled = status === 'scheduled' ? due : null;
      }
      siRows.push([T, suppliers[s], `${s}-${mo.slice(0, 7).replace('-', '')}`, invDate, due, 'MUR', amt, '1', `Monthly invoice ${mo.slice(0, 7)}`, acct[a], status, s === 'S01' || s === 'S02' ? 'critical' : s === 'S06' ? 'low' : 'normal', scheduled, paid, paid ? `PAY-${s}-${mo.slice(0, 7)}` : null, userFin, approvedBy, approvedBy ? `${invDate} 10:00:00+04` : null, true]);
    }
  }
  await insertMany(tx, 'supplier_invoices', ['tenant_id', 'supplier_id', 'number', 'invoice_date', 'due_date', 'currency', 'amount', 'fx_rate_to_base', 'description', 'account_id', 'status', 'priority', 'scheduled_date', 'paid_date', 'payment_ref', 'submitted_by', 'approved_by', 'approved_at', 'is_demo'], siRows);

  // ---------------- Bank accounts & statements ----------------
  const banks = idMap(await ins('bank_accounts', ['code', 'name', 'bank_name', 'currency', 'account_class', 'masked_number', 'opening_balance', 'opening_date', 'ledger_account_id'], [
    ['MCB-OPS', 'MCB Operating (MUR)', 'MCB', 'MUR', 'operating', '****0042', '4200000', DEMO_START, acct['1000']],
    ['SBM-OPS', 'SBM Operating (MUR)', 'SBM', 'MUR', 'operating', '****7731', '1100000', DEMO_START, acct['1000']],
    ['MCB-USD', 'MCB Operating (USD)', 'MCB', 'USD', 'operating', '****9150', '25000', DEMO_START, acct['1000']],
    ['SBM-SAFE', 'SBM Safeguarding — merchant funds', 'SBM', 'MUR', 'safeguarded', '****5560', '18000000', DEMO_START, acct['1010']],
    ['MCB-SETTLE', 'MCB Merchant settlement', 'MCB', 'MUR', 'merchant_settlement', '****6618', '9000000', DEMO_START, acct['1010']],
    ['AFR-GUAR', 'AfrAsia guarantee deposit (restricted)', 'AfrAsia', 'MUR', 'restricted', '****1207', '1500000', DEMO_START, acct['1000']]]));
  const bt: unknown[][] = []; let btSeq = 0;
  const btCols = ['tenant_id', 'bank_account_id', 'txn_date', 'value_date', 'amount', 'currency', 'description', 'reference', 'counterparty', 'category', 'bank_ref', 'is_demo'];
  const addBt = (acc: string, date: string, amt: Dec, desc: string, ref: string | null, cp: string | null, cat: string) => { btSeq++; bt.push([T, banks[acc], date, date, amt.toFixed(2), acc === 'MCB-USD' ? 'USD' : 'MUR', desc, ref, cp, cat, `${acc}-${pad(btSeq, 6)}`, true]); };
  for (const [wk, v] of [...weekSweep.entries()].sort()) {
    if (wk > DEMO_END) continue;
    addBt('MCB-SETTLE', wk, v.toDecimalPlaces(2).neg(), 'Fee sweep to operating account', `SWEEP-${wk}`, 'MIPSIT Digital', 'settlement');
    addBt('MCB-OPS', wk, v.toDecimalPlaces(2), 'Fee sweep from merchant settlement account', `SWEEP-${wk}`, 'MCB Merchant settlement', 'settlement');
  }
  for (const inv of invRows) { const paid = inv[14] as string | null; if (paid && paid <= DEMO_END) addBt(r() < 0.8 ? 'MCB-OPS' : 'SBM-OPS', paid, dec(inv[6] as string), `Receipt ${inv[1]}`, inv[1] as string, null, 'receipts'); }
  for (const si of siRows) { const paid = si[13] as string | null; if (paid && paid <= DEMO_END) addBt('MCB-OPS', paid, dec(si[6] as string).neg(), `Supplier payment ${si[2]}`, si[2] as string, null, 'supplier'); }
  for (const mo of months) {
    const d25 = addDays(mo, 24); const pr = actualPayroll.get(mo)!;
    addBt('MCB-OPS', d25, pr.toDecimalPlaces(2).neg(), 'Payroll run', `PAYROLL-${mo.slice(0, 7)}`, 'Staff', 'payroll');
    addBt('MCB-OPS', addDays(mo, 27), dec('-35000'), 'Term loan repayment (principal)', `LOAN-${mo.slice(0, 7)}`, 'MCB Loans', 'loan');
    const charges = monthlyOpex.get(mo)!.banking.toDecimalPlaces(2);
    addBt('MCB-OPS', monthEnd(mo), mo === '2026-10-01' ? dec('-1245.50') : charges.neg(), 'Bank charges', `CHG-${mo.slice(0, 7)}`, 'MCB', 'bank_charges');
    if (['2025-07-01', '2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'].includes(mo)) addBt('MCB-OPS', addDays(mo, 19), dec(-(55000 + months.indexOf(mo) * 1500)), 'MRA corporate tax (APS)', `MRA-${mo.slice(0, 7)}`, 'Mauritius Revenue Authority', 'tax');
    addBt('MCB-USD', addDays(mo, 14), dec('-380'), 'Card scheme portal subscription (USD)', `USD-SUB-${mo.slice(0, 7)}`, 'Scheme', 'supplier');
    // merchant settlement & safeguarding flows (funds held for merchants — excluded from operating cash)
    addBt('SBM-SAFE', addDays(mo, 10), dec(Math.round((r() - 0.5) * 900000)), 'Net safeguarding movement', `SAFE-${mo.slice(0, 7)}`, 'Merchants', 'settlement');
  }
  addBt('MCB-OPS', '2026-02-12', dec('-385000'), 'Server & HSM purchase', 'CAPEX-2026-02', 'HSM vendor', 'capex');
  addBt('MCB-OPS', '2026-06-08', dec('-152000'), 'SoftPOS certification & devices', 'CAPEX-2026-06', 'Scheme labs', 'capex');
  // Storyline 4: October anomalies on MCB-OPS
  addBt('MCB-OPS', '2026-10-22', dec('7500'), 'Incoming transfer — unidentified', 'UNKNOWN-REF', 'Unknown remitter', 'receipts');
  const lastSweep = bt.filter((x) => x[1] === banks['MCB-OPS'] && x[9] === 'settlement' && (x[2] as string) >= '2026-10-01').pop()!;
  bt.push([...lastSweep.slice(0, 10), `${lastSweep[10]}-DUP`, true]);  // duplicate statement line
  await insertMany(tx, 'bank_transactions', btCols, bt);

  // Ledger-side expected cash items for MCB-OPS, Sep–Oct 2026 (reconciliation)
  const ledgerItems: unknown[][] = [];
  for (const x of bt.filter((b) => b[1] === banks['MCB-OPS'] && (b[2] as string) >= '2026-09-01')) {
    const ref = x[7] as string; const date = x[2] as string; let amt = dec(x[4] as string);
    if (ref === 'UNKNOWN-REF' || (x[10] as string).endsWith('-DUP')) continue;
    if (ref === 'CHG-2026-10') amt = dec('-1200.00');
    const st = x[9] === 'receipts' ? 'customer_receipt' : x[9] === 'supplier' ? 'supplier_payment' : x[9] === 'payroll' ? 'payroll' : x[9] === 'tax' ? 'tax' : x[9] === 'bank_charges' ? 'bank_charge' : x[9] === 'settlement' ? 'settlement' : 'gl';
    if (ref.startsWith('SWEEP-') && date >= '2026-10-01' && date < '2026-10-08') {
      // many-to-one in reverse: ledger records the weekly sweep as two settlement batches
      const half = amt.div(2).toDecimalPlaces(2);
      ledgerItems.push([T, banks['MCB-OPS'], date, half.toFixed(2), 'MUR', st, ref, 'Settlement batch A']);
      ledgerItems.push([T, banks['MCB-OPS'], date, amt.minus(half).toFixed(2), 'MUR', st, ref, 'Settlement batch B']);
      continue;
    }
    ledgerItems.push([T, banks['MCB-OPS'], addDays(date, x[9] === 'receipts' ? -1 : 0), amt.toFixed(2), 'MUR', st, ref, x[6]]);
  }
  ledgerItems.push([T, banks['MCB-OPS'], '2026-10-31', '-48200.00', 'MUR', 'supplier_payment', 'PAY-S09-2026-10', 'R&D contractor payment — not yet cleared']);
  await insertMany(tx, 'cash_ledger_items', ['tenant_id', 'bank_account_id', 'item_date', 'amount', 'currency', 'source_type', 'reference', 'description', 'is_demo'], ledgerItems.map((x) => [...x, true]));
  await audit(tx, { tenantId: T, userId: null, actorLabel: 'demo-generator', action: 'demo.bank_statements_generated', entityType: 'bank_transactions', payload: { rows: bt.length, ledger_items: ledgerItems.length } });

  tick('bank inserted');
  // ---------------- Budgets ----------------
  const budgetVersions = idMap(await insertMany(tx, 'budget_versions', ['tenant_id', 'name', 'fiscal_year', 'kind', 'status', 'revision', 'notes', 'created_by', 'submitted_by', 'approved_by', 'approved_at', 'is_demo'], [
    [T, 'FY2026 Budget v1', 2026, 'budget', 'approved', 1, 'Board-approved budget for FY2026 (Jul 2025 – Jun 2026). DEMO.', userFin, userFin, userCfo, '2025-06-20 15:00:00+04', true],
    [T, 'FY2027 Budget v1', 2027, 'budget', 'approved', 1, 'Board-approved budget for FY2027 (Jul 2026 – Jun 2027). DEMO.', userFin, userFin, userCfo, '2026-06-18 15:00:00+04', true],
    [T, 'FY2027 Forecast Q2 (draft)', 2027, 'forecast', 'draft', 1, 'Re-forecast after SBM wholesale increase — in preparation.', userFin, null, null, null, true]], 'id, name'), 'name');
  const blRows: unknown[][] = [];
  const budgetFor = (mo: string) => (mo < '2026-07-01' ? budgetVersions['FY2026 Budget v1'] : budgetVersions['FY2027 Budget v1']);
  for (const mo of months) {
    if (mo < '2025-07-01') continue;
    const a = monthAgg.get(mo)!; const i = months.indexOf(mo);
    const v = budgetFor(mo);
    const txnRev = a.mdr.minus(a.wh);
    const budTxn = mo >= '2026-09-01' ? txnRev.times('1.12') : txnRev.times(dec(1.02 + (r() - 0.5) * 0.05)); // budget did not anticipate SBM increase
    blRows.push([T, v, acct['4000'], null, null, mo, budTxn.toFixed(2)]);
    blRows.push([T, v, acct['4100'], null, null, mo, saasByMonth.get(mo)!.times('1.05').toFixed(2)]);
    blRows.push([T, v, acct['4200'], null, null, mo, dec(36000 + i * 1000).toFixed(2)]);
    blRows.push([T, v, acct['5000'], null, null, mo, a.proc.toFixed(2)]);
    const opex = monthlyOpex.get(mo)!;
    const byAcc = new Map<string, Dec>();
    for (const [k, p] of Object.entries(opexPlan)) byAcc.set(p.acc, (byAcc.get(p.acc) ?? ZERO).plus(dec(p.base * Math.pow(1 + p.growth, i) * 0.98)));
    for (const [acc, amt] of byAcc) blRows.push([T, v, acct[acc], null, null, mo, amt.toFixed(2)]);
    void opex;
  }
  // FY2027 future months (Nov 2026 – Jun 2027) for full-year view
  for (const mo of monthsInRange('2026-11-01', '2027-06-01')) {
    const i = months.length + monthsInRange('2026-11-01', mo).length - 1; const last = monthAgg.get('2026-10-01')!;
    const v = budgetVersions['FY2027 Budget v1'];
    blRows.push([T, v, acct['4000'], null, null, mo, last.mdr.minus(last.wh).times('1.14').times(dec(1 + 0.012 * (i - 17))).toFixed(2)]);
    blRows.push([T, v, acct['4100'], null, null, mo, saasByMonth.get('2026-10-01')!.times('1.08').toFixed(2)]);
    blRows.push([T, v, acct['4200'], null, null, mo, dec(36000 + i * 1000).toFixed(2)]);
    blRows.push([T, v, acct['5000'], null, null, mo, last.proc.times('1.03').toFixed(2)]);
    const byAcc = new Map<string, Dec>();
    for (const p of Object.values(opexPlan)) byAcc.set(p.acc, (byAcc.get(p.acc) ?? ZERO).plus(dec(p.base * Math.pow(1 + p.growth, i) * 0.98)));
    for (const [acc, amt] of byAcc) blRows.push([T, v, acct[acc], null, null, mo, amt.toFixed(2)]);
  }
  // Draft forecast = copy of FY2027 lines with SBM effect
  for (const b of blRows.filter((x) => x[1] === budgetVersions['FY2027 Budget v1'])) {
    const isTxnRev = b[2] === acct['4000'];
    blRows.push([T, budgetVersions['FY2027 Forecast Q2 (draft)'], b[2], null, null, b[5], isTxnRev && (b[5] as string) >= '2026-09-01' ? dec(b[6] as string).times('0.86').toFixed(2) : b[6]]);
  }
  // Insert lines before approval lock: temporarily mark approved versions as draft
  await tx.query("UPDATE budget_versions SET status = 'draft' WHERE tenant_id = $1", [T]);
  await insertMany(tx, 'budget_lines', ['tenant_id', 'version_id', 'account_id', 'department_id', 'product_id', 'period', 'amount_base'], blRows);
  await tx.query("UPDATE budget_versions SET status = 'approved' WHERE tenant_id = $1 AND approved_by IS NOT NULL", [T]);
  await insertMany(tx, 'variance_commentary', ['tenant_id', 'version_id', 'period', 'line_key', 'comment', 'author_id'], [
    [T, budgetVersions['FY2027 Budget v1'], '2026-09-01', 'revenue', 'Net payment revenue below budget: SBM international wholesale +35 bps from 1 Sep 2026 not in budget. Repricing options under review (CEO Decision Center).', userCfo],
    [T, budgetVersions['FY2026 Budget v1'], '2026-06-01', 'opex', 'Marketing over budget due to Fintech Expo participation (one-off).', userFin],
  ]);

  // ---------------- Operations ----------------
  const obRows: unknown[][] = [];
  for (const m of MERCHANTS.filter((x) => x.activated >= '2025-01-01')) {
    const dur = m.activated >= '2026-03-15' ? 14 + Math.round(r() * 5) : 30 + Math.round(r() * 9);
    obRows.push([T, mid[m.code], m.name, addDays(m.activated, -dur), m.activated, 'activated', true]);
  }
  for (let i = 0; i < 46; i++) {
    const opened = addDays(DEMO_START, Math.floor(r() * (totalDays - 20)));
    const after = opened >= '2026-03-15';
    const dur = after ? 12 + Math.round(r() * 8) : 28 + Math.round(r() * 14);
    const closed = addDays(opened, dur);
    const status = closed > DEMO_END ? (r() < 0.5 ? 'open' : 'kyc_review') : r() < 0.25 ? 'rejected' : 'activated';
    obRows.push([T, null, `Applicant ${pad(i + 1, 3)} (DEMO)`, opened, status === 'open' || status === 'kyc_review' ? null : closed, status, true]);
  }
  for (let i = 0; i < 7; i++) obRows.push([T, null, `Pipeline applicant ${i + 1} (DEMO)`, addDays(DEMO_END, -Math.floor(r() * 25)), null, i % 2 ? 'open' : 'kyc_review', true]);
  await insertMany(tx, 'onboarding_cases', ['tenant_id', 'merchant_id', 'applicant', 'opened_at', 'closed_at', 'status', 'is_demo'], obRows);
  const incRows: unknown[][] = []; const upRows: unknown[][] = [];
  for (let d = 0; d < totalDays; d++) {
    const date = addDays(DEMO_START, d);
    const k = Math.floor(r() * 2.2) + (date === '2026-09-17' || date === '2026-09-18' ? 6 : 0);
    for (let i = 0; i < k; i++) {
      const sev = date.startsWith('2026-09-1') && i < 2 ? 'sev1' : r() < 0.1 ? 'sev2' : r() < 0.5 ? 'sev3' : 'sev4';
      const m = MERCHANTS[Math.floor(r() * MERCHANTS.length)];
      incRows.push([T, date >= m.activated ? mid[m.code] : null, `${date}T${pad(8 + Math.floor(r() * 10))}:00:00+04:00`, `${addDays(date, sev === 'sev1' ? 0 : 1)}T18:00:00+04:00`, sev, ['settlement', 'integration', 'card_decline', 'reporting', 'onboarding'][Math.floor(r() * 5)], sev === 'sev1' ? 'SBM authorisation outage — elevated declines' : 'Merchant support request', true]);
    }
    upRows.push([T, date, 'gateway', date === '2026-09-17' ? '98.9100' : date === '2026-09-18' ? '99.4200' : (99.93 + r() * 0.07).toFixed(4), true]);
  }
  await insertMany(tx, 'support_incidents', ['tenant_id', 'merchant_id', 'opened_at', 'resolved_at', 'severity', 'category', 'title', 'is_demo'], incRows);
  await insertMany(tx, 'platform_uptime', ['tenant_id', 'day', 'service', 'uptime_pct', 'is_demo'], upRows);

  // ---------------- Treasury forecast items & regulatory ----------------
  await insertMany(tx, 'cash_forecast_items', ['tenant_id', 'category', 'description', 'amount_base', 'recurrence', 'start_date', 'end_date', 'day_of_month', 'is_demo', 'created_by'], [
    [T, 'payroll', 'Monthly payroll (net + statutory)', '-405000', 'monthly', '2026-01-25', null, 25, true, userFin],
    [T, 'loan_repayments', 'Term loan principal', '-35000', 'monthly', '2025-05-28', '2028-04-28', 28, true, userFin],
    [T, 'taxes', 'MRA APS instalment', '-62000', 'once', '2027-01-20', null, null, true, userFin],
    [T, 'regulatory', 'BoM licence renewal (DEMO amount — verify)', '-150000', 'once', '2026-12-15', null, null, true, userFin],
    [T, 'capex', 'SoftPOS device batch #2', '-95000', 'once', '2026-12-05', null, null, true, userFin],
    [T, 'customer_receipts', 'Weekly fee sweep from settlement account (trailing 8-week average)', '135000', 'weekly', '2026-11-02', null, null, true, userFin],
    [T, 'merchant_obligations', 'Chargeback & refund float top-up', '-12000', 'weekly', '2026-11-06', null, null, true, userFin],
    [T, 'other_out', 'Bank charges', '-11000', 'monthly', '2026-11-30', null, 30, true, userFin],
  ]);
  await insertMany(tx, 'regulatory_requirements', ['tenant_id', 'code', 'description', 'minimum_amount_base', 'basis'], [
    [T, 'MIN-CAP', 'Minimum unimpaired capital (DEMO placeholder)', '2500000', 'DEMO placeholder — confirm the applicable Bank of Mauritius requirement with compliance before use'],
    [T, 'MIN-LIQ', 'Board minimum liquidity buffer', '3000000', 'Board treasury policy (DEMO)'],
  ]);

  // ---------------- Periods ----------------
  for (const mo of months) {
    const status = mo <= '2026-07-01' ? 'locked' : mo === '2026-08-01' ? 'soft_closed' : 'open';
    await tx.query('INSERT INTO financial_periods (tenant_id, period, status, locked_by, locked_at) VALUES ($1,$2,$3,$4,$5)', [T, mo, status, status === 'locked' ? userCfo : null, status === 'locked' ? `${addDays(monthEnd(mo), 12)} 17:00:00+04` : null]);
  }

  // ---------------- Strategy, decisions, scenarios ----------------
  const objectives = idMap(await insertMany(tx, 'strategic_objectives', ['tenant_id', 'code', 'title', 'description', 'theme', 'fiscal_year', 'owner_user_id'], [
    [T, 'OBJ-1', 'Grow the active merchant base', 'Reach 40 active merchants with balanced vertical mix', 'merchant_acquisition', 2027, userCeo],
    [T, 'OBJ-2', 'Automate merchant onboarding', 'Onboarding in under 14 days with digital KYC', 'onboarding_automation', 2027, userCeo],
    [T, 'OBJ-3', 'Platform stability', '99.95 % gateway uptime and ≥ 95 % success rate', 'platform_stability', 2027, userCeo],
    [T, 'OBJ-4', 'Protect payment margins', 'Maintain net take rate ≥ 60 bps despite acquirer cost pressure', 'profitability', 2027, userCfo],
    [T, 'OBJ-5', 'Diversify revenue', 'SaaS & services ≥ 25 % of revenue', 'revenue_diversification', 2027, userCeo],
    [T, 'OBJ-6', 'Expand payment acceptance', 'Launch SoftPOS and extend QR/wallet coverage', 'acceptance_expansion', 2027, userCeo]], 'id, code'));
  await insertMany(tx, 'key_results', ['tenant_id', 'objective_id', 'title', 'kpi_code', 'quarter', 'baseline', 'target', 'unit'], [
    [T, objectives['OBJ-1'], 'Active merchants', 'OPS.ACTIVE_MERCHANTS', '2026-Q4', '27', '32', 'count'],
    [T, objectives['OBJ-2'], 'Average onboarding duration (days)', 'OPS.ONBOARDING_DAYS', '2026-Q4', '34', '14', 'days'],
    [T, objectives['OBJ-3'], 'Gateway uptime', 'OPS.UPTIME', '2026-Q4', '0.9993', '0.9995', 'percent'],
    [T, objectives['OBJ-3'], 'Payment success rate', 'PAY.SUCCESS_RATE', '2026-Q4', '0.955', '0.96', 'percent'],
    [T, objectives['OBJ-4'], 'Effective take rate (bps)', 'PAY.TAKE_RATE', '2026-Q4', '72', '70', 'bps'],
    [T, objectives['OBJ-5'], 'Monthly EBITDA (MUR)', 'FIN.EBITDA', '2026-Q4', '90000', '120000', 'money']]);
  const dec1 = await one<{ id: string }>(tx, `INSERT INTO executive_decisions (tenant_id, code, title, description, rationale, evidence, owner_user_id, approver_user_id, proposed_by, approved_at, expected_impact, measurement, implementation_deadline, status, actual_outcome, outcome_measured_at)
    VALUES ($1,'DEC-2026-001','Automate merchant onboarding (digital KYC workflow)','Deploy digital KYC & document workflow to cut onboarding time and manual effort.','Onboarding averaged ~34 days; pipeline leakage and manual effort limit acquisition.',
    $2, $3, $4, $5, '2026-03-10 11:00:00+04', $6, $7, '2026-03-15', 'implemented', NULL, NULL) RETURNING id`,
    [T, JSON.stringify([{ kind: 'kpi', ref: 'OPS.ONBOARDING_DAYS', note: 'Trailing 6-month average 34 days' }]), userFin, userCeo, userCfo,
     JSON.stringify({ metric: 'OPS.ONBOARDING_DAYS', expected_value: '16', expected_monthly_ebitda_delta: '-8000', note: 'Run cost MUR 8k/month; benefit through activations' }),
     JSON.stringify({ type: 'kpi', kpi_code: 'OPS.ONBOARDING_DAYS', baseline_start: '2025-09-01', baseline_end: '2026-02-28', expected_value: '16' })]);
  await insertMany(tx, 'initiatives', ['tenant_id', 'code', 'objective_id', 'decision_id', 'title', 'owner_user_id', 'department', 'budget_base', 'spent_base', 'target', 'kpi_code', 'deadline', 'status', 'progress_pct', 'blockers', 'next_action', 'expected_impact', 'risk_level'], [
    [T, 'INI-01', objectives['OBJ-2'], dec1!.id, 'Digital KYC workflow rollout', userFin, 'OPS', '450000', '412000', 'Onboarding < 16 days', 'OPS.ONBOARDING_DAYS', '2026-03-15', 'done', 100, null, 'Post-implementation review', 'Onboarding −18 days', 'low'],
    [T, 'INI-02', objectives['OBJ-6'], null, 'SoftPOS commercial launch', userCeo, 'TECH', '600000', '152000', 'SoftPOS live with 20 merchants', 'PAY.GPV', '2026-12-15', 'at_risk', 55, 'Scheme certification feedback pending', 'Close Mastercard certification findings', 'New product line', 'high'],
    [T, 'INI-03', objectives['OBJ-3'], null, 'Acquirer failover routing', userFin, 'TECH', '180000', '60000', 'Automatic failover < 60 s', 'PAY.SUCCESS_RATE', '2026-11-30', 'on_track', 40, null, 'Load-test failover with MCB', 'Protect success rate during acquirer outages', 'medium'],
    [T, 'INI-04', objectives['OBJ-1'], null, 'Hospitality vertical sales push', userCeo, 'SALES', '120000', '45000', '+6 hotel merchants', 'OPS.ACTIVE_MERCHANTS', '2027-03-31', 'on_track', 30, null, 'Pipeline review with Lagoon group referrals', 'GPV growth', 'medium'],
    [T, 'INI-05', objectives['OBJ-5'], null, 'Reconciliation-as-a-service packaging', userCfo, 'SALES', '90000', '20000', '10 paying merchants', 'FIN.REVENUE', '2027-01-31', 'blocked', 15, 'Pricing approval pending; Lagoon dispute on recon charges', 'Resolve Lagoon SLA credit dispute', 'SaaS revenue', 'medium']]);
  await insertMany(tx, 'action_items', ['tenant_id', 'code', 'title', 'source_type', 'owner_user_id', 'due_date', 'status', 'created_by'], [
    [T, 'ACT-0001', 'Obtain SBM written confirmation of 2026-09 international fee schedule', 'war_room', userCfo, '2026-11-07', 'open', userCeo],
    [T, 'ACT-0002', 'Post August revenue accrual correction (MUR 18,450) after investigation', 'reconciliation', userFin, '2026-11-05', 'open', userCfo],
    [T, 'ACT-0003', 'Resolve Lagoon Resorts invoice dispute (Sep SaaS)', 'war_room', userCeo, '2026-11-10', 'in_progress', userCeo]]);
  await audit(tx, { tenantId: T, userId: null, actorLabel: 'demo-generator', action: 'demo.seed_completed', entityType: 'tenant', entityId: T, payload: { merchants: MERCHANTS.length, transactions: seq, months: months.length } });

  tick('strategy inserted');
  // ---------------- KPI registry & monthly calculation runs ----------------
  await syncKpiRegistry(tx, T, null);
  if (opts.withCalc !== false) {
    for (const mo of months) { await runCalculation(tx, { tenantId: T, userId: null, start: mo, end: monthEnd(mo), reason: 'demo seed: monthly close' }); tick(`calc ${mo}`); }
  }
  return { transactions: seq, merchants: MERCHANTS.length };
}

function weekOf(d: string): string { const x = new Date(`${d}T00:00:00Z`); const dow = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dow + 4); return x.toISOString().slice(0, 10); } // Friday sweep
export { sum, addMonths };
