/**
 * Import target definitions: fields, aliases for schema detection / auto-mapping,
 * and pure row validation. Validation receives a reference context loaded from
 * the tenant database; it never writes.
 */
import { dec } from '../money';

export type FieldType = 'text' | 'date' | 'datetime' | 'decimal' | 'int' | 'enum' | 'ccy' | 'month';
export interface FieldDef { key: string; label: string; type: FieldType; required?: boolean; aliases: string[]; values?: string[] }
export interface KindDef { key: ImportKind; label: string; description: string; fields: FieldDef[]; naturalKey: string[]; amountField?: string; sourceAdapters?: string[] }
export type ImportKind = 'transactions' | 'gl_entries' | 'bank_transactions' | 'merchants' | 'fee_schedules' | 'customer_invoices' | 'budget_lines';

const f = (key: string, label: string, type: FieldType, required: boolean, aliases: string[], values?: string[]): FieldDef => ({ key, label, type, required, aliases, values });

export const KINDS: Record<ImportKind, KindDef> = {
  transactions: {
    key: 'transactions', label: 'Payment transactions', description: 'Gateway / acquirer transaction reports. Fees are computed by the fee engine from effective pricing agreements and fee schedules.',
    naturalKey: ['external_ref'], amountField: 'amount', sourceAdapters: ['MIPS gateway export', 'Acquirer transaction report (MCB / SBM)'],
    fields: [
      f('external_ref', 'Transaction reference', 'text', true, ['txn_id', 'transaction_id', 'reference', 'ref', 'rrn', 'payment_id']),
      f('merchant_code', 'Merchant code', 'text', true, ['merchant', 'merchant_id', 'mid', 'merchant_ref']),
      f('product_code', 'Product code', 'text', true, ['product', 'channel']),
      f('acquirer_code', 'Acquirer code', 'text', false, ['acquirer', 'bank', 'acquiring_bank']),
      f('payment_method', 'Payment method code', 'text', true, ['method', 'payment_method_code', 'scheme_method', 'instrument']),
      f('card_scheme', 'Card scheme', 'text', false, ['scheme', 'brand']),
      f('card_region', 'Card region', 'enum', false, ['region', 'card_origin', 'domestic_international'], ['domestic', 'international', 'na']),
      f('country', 'Country (ISO-2)', 'text', false, ['card_country', 'issuer_country']),
      f('status', 'Status', 'enum', true, ['txn_status', 'result', 'state'], ['success', 'failed', 'refunded', 'reversed']),
      f('txn_currency', 'Transaction currency', 'ccy', true, ['currency', 'ccy', 'txn_ccy']),
      f('settlement_currency', 'Settlement currency', 'ccy', false, ['settle_currency', 'settlement_ccy']),
      f('amount', 'Amount (transaction currency)', 'decimal', true, ['txn_amount', 'gross_amount', 'value']),
      f('fx_rate', 'FX rate to base', 'decimal', false, ['fx', 'exchange_rate', 'rate']),
      f('event_at', 'Event (authorisation) time', 'datetime', true, ['timestamp', 'created_at', 'auth_time', 'transaction_time', 'date_time']),
      f('processed_at', 'Processing time', 'datetime', false, ['captured_at', 'cleared_at']),
      f('settlement_date', 'Settlement date', 'date', false, ['settled_on', 'value_date']),
      f('accounting_date', 'Accounting date', 'date', false, ['booking_date', 'posting_date']),
    ],
  },
  gl_entries: {
    key: 'gl_entries', label: 'General ledger entries', description: 'Journal lines exported from the accounting system (Odoo “Journal Items”, QuickBooks “Journal” report). Journals must balance.',
    naturalKey: ['journal_ref', 'line_no'], amountField: 'debit', sourceAdapters: ['Odoo journal items export', 'QuickBooks journal report export', 'Generic GL CSV'],
    fields: [
      f('journal_ref', 'Journal reference', 'text', true, ['journal', 'move', 'entry', 'journal_entry', 'move_name', 'num', 'transaction_no']),
      f('line_no', 'Line number', 'int', false, ['line', 'line_number', 'seq']),
      f('entry_date', 'Entry date', 'date', true, ['date', 'posting_date', 'accounting_date']),
      f('account_code', 'Account code', 'text', true, ['account', 'account_number', 'gl_account', 'account_id']),
      f('department_code', 'Department', 'text', false, ['department', 'analytic_account', 'cost_centre', 'cost_center', 'class']),
      f('product_code', 'Product', 'text', false, ['product']),
      f('description', 'Description', 'text', false, ['label', 'memo', 'name', 'narration']),
      f('currency', 'Currency', 'ccy', false, ['ccy', 'currency_code']),
      f('debit', 'Debit', 'decimal', false, ['dr', 'debit_amount']),
      f('credit', 'Credit', 'decimal', false, ['cr', 'credit_amount']),
      f('fx_rate', 'FX rate to base', 'decimal', false, ['rate', 'exchange_rate']),
    ],
  },
  bank_transactions: {
    key: 'bank_transactions', label: 'Bank statement lines', description: 'Bank statement CSV/XLSX (MCB, SBM, AfrAsia internet-banking exports). Signed amounts or separate debit/credit columns.',
    naturalKey: ['bank_account_code', 'bank_ref'], amountField: 'amount', sourceAdapters: ['MCB internet banking CSV', 'SBM statement export', 'Generic statement CSV'],
    fields: [
      f('bank_account_code', 'Bank account code', 'text', true, ['account', 'account_code', 'bank_account']),
      f('txn_date', 'Transaction date', 'date', true, ['date', 'booking_date', 'transaction_date']),
      f('value_date', 'Value date', 'date', false, ['value']),
      f('amount', 'Signed amount', 'decimal', false, ['net_amount']),
      f('debit', 'Debit (outflow)', 'decimal', false, ['withdrawal', 'dr', 'money_out']),
      f('credit', 'Credit (inflow)', 'decimal', false, ['deposit', 'cr', 'money_in']),
      f('currency', 'Currency', 'ccy', false, ['ccy']),
      f('description', 'Description', 'text', true, ['narrative', 'details', 'particulars', 'memo']),
      f('reference', 'Reference', 'text', false, ['ref', 'customer_reference', 'payment_ref']),
      f('counterparty', 'Counterparty', 'text', false, ['beneficiary', 'payer', 'remitter']),
      f('category', 'Category', 'enum', false, ['type'], ['receipts', 'payroll', 'supplier', 'tax', 'settlement', 'bank_charges', 'acquirer_fees', 'loan', 'equity', 'capex', 'other']),
      f('bank_ref', 'Bank line id', 'text', false, ['statement_ref', 'transaction_id', 'line_id']),
    ],
  },
  merchants: {
    key: 'merchants', label: 'Merchant master data', description: 'New merchants. Existing merchant codes are reported as duplicates and never overwritten.',
    naturalKey: ['code'], sourceAdapters: ['CRM / onboarding export'],
    fields: [
      f('code', 'Merchant code', 'text', true, ['merchant_code', 'mid', 'merchant_id']),
      f('name', 'Merchant name', 'text', true, ['merchant_name', 'legal_name', 'trading_name']),
      f('vertical_code', 'Vertical', 'text', false, ['vertical', 'industry', 'mcc_group']),
      f('group_code', 'Merchant group', 'text', false, ['group']),
      f('segment', 'Segment', 'enum', false, [], ['enterprise', 'mid_market', 'sme', 'micro']),
      f('country', 'Country', 'text', false, []),
      f('activated_at', 'Activation date', 'date', false, ['activation_date', 'go_live']),
      f('commercial_importance', 'Commercial importance (1–5)', 'int', false, ['importance']),
      f('price_locked_until', 'Price locked until', 'date', false, ['price_lock']),
      f('contract_notes', 'Contract notes', 'text', false, ['notes']),
    ],
  },
  fee_schedules: {
    key: 'fee_schedules', label: 'Acquirer fee schedules', description: 'Effective-dated wholesale fee schedules. An open-ended schedule for the same acquirer/method/region is explicitly closed the day before the new one (shown in preview).',
    naturalKey: ['acquirer_code', 'payment_method', 'card_region', 'effective_from'], sourceAdapters: ['Acquirer tariff notice'],
    fields: [
      f('acquirer_code', 'Acquirer code', 'text', true, ['acquirer']),
      f('payment_method', 'Payment method (blank = all)', 'text', false, ['method']),
      f('card_region', 'Card region', 'enum', false, ['region'], ['domestic', 'international', 'any']),
      f('wholesale_bps', 'Wholesale rate (bps)', 'decimal', true, ['bps', 'rate_bps', 'wholesale']),
      f('fixed_fee', 'Fixed fee per txn', 'decimal', false, ['fixed']),
      f('effective_from', 'Effective from', 'date', true, ['from', 'start_date']),
      f('effective_to', 'Effective to', 'date', false, ['to', 'end_date']),
      f('schedule_ref', 'Schedule reference', 'text', false, ['reference', 'ref', 'notice']),
    ],
  },
  customer_invoices: {
    key: 'customer_invoices', label: 'Customer invoices', description: 'Invoices issued to merchants (SaaS, setup, services).',
    naturalKey: ['number'], amountField: 'amount', sourceAdapters: ['Odoo customer invoices export', 'QuickBooks invoice list'],
    fields: [
      f('number', 'Invoice number', 'text', true, ['invoice', 'invoice_number', 'num']),
      f('merchant_code', 'Customer (merchant code)', 'text', true, ['customer', 'merchant', 'partner']),
      f('issue_date', 'Issue date', 'date', true, ['date', 'invoice_date']),
      f('due_date', 'Due date', 'date', true, ['due']),
      f('currency', 'Currency', 'ccy', false, ['ccy']),
      f('amount', 'Amount', 'decimal', true, ['total', 'amount_total']),
      f('amount_paid', 'Amount paid', 'decimal', false, ['paid']),
      f('paid_date', 'Paid date', 'date', false, ['payment_date']),
      f('fx_rate', 'FX rate to base', 'decimal', false, ['rate']),
      f('description', 'Description', 'text', false, ['memo', 'label']),
    ],
  },
  budget_lines: {
    key: 'budget_lines', label: 'Budget lines', description: 'Monthly budget amounts for a DRAFT budget version (approved versions are locked).',
    naturalKey: ['version_name', 'account_code', 'department_code', 'product_code', 'period'], amountField: 'amount',
    fields: [
      f('version_name', 'Budget version name', 'text', true, ['version', 'budget']),
      f('account_code', 'Account code', 'text', true, ['account']),
      f('period', 'Month (YYYY-MM)', 'month', true, ['month']),
      f('amount', 'Amount', 'decimal', true, ['value', 'budget_amount']),
      f('department_code', 'Department', 'text', false, ['department']),
      f('product_code', 'Product', 'text', false, ['product']),
    ],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Pick the import kind whose fields best match the file headers. */
export function detectKind(columns: string[]): { kind: ImportKind; score: number }[] {
  const cols = columns.map(norm);
  return (Object.values(KINDS).map((k) => {
    let score = 0;
    for (const fd of k.fields) if (cols.some((c) => c === fd.key || fd.aliases.includes(c))) score += fd.required ? 2 : 1;
    return { kind: k.key, score };
  })).sort((a, b) => b.score - a.score);
}

/** Map target field → source column (exact key, then alias). */
export function autoMap(kind: ImportKind, columns: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const fd of KINDS[kind].fields) {
    const hit = columns.find((c) => norm(c) === fd.key) ?? columns.find((c) => fd.aliases.includes(norm(c)));
    if (hit) map[fd.key] = hit;
  }
  return map;
}

export interface CellResult { value: string | null; error?: string }
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function toDate(v: string): string | null {
  if (DATE.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // DD/MM/YYYY (Mauritius convention)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})[T ]/); if (iso) return iso[1];
  return null;
}
function validDate(d: string) { const x = new Date(`${d}T00:00:00Z`); return !isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d; }

export function coerce(fd: FieldDef, raw: string | undefined): CellResult {
  const v = (raw ?? '').trim();
  if (v === '') return fd.required ? { value: null, error: `${fd.label} is required` } : { value: null };
  switch (fd.type) {
    case 'decimal': { const c = v.replace(/[\s,](?=\d{3}\b)/g, '').replace(/^\((.*)\)$/, '-$1'); if (!/^-?\d+(\.\d+)?$/.test(c)) return { value: null, error: `${fd.label}: "${v}" is not a decimal number` }; return { value: dec(c).toString() }; }
    case 'int': return /^-?\d+$/.test(v) ? { value: v } : { value: null, error: `${fd.label}: "${v}" is not an integer` };
    case 'date': { const d = toDate(v); return d && validDate(d) ? { value: d } : { value: null, error: `${fd.label}: "${v}" is not a valid date (YYYY-MM-DD or DD/MM/YYYY)` }; }
    case 'month': return /^\d{4}-\d{2}$/.test(v) ? { value: `${v}-01` } : DATE.test(v) && v.endsWith('-01') ? { value: v } : { value: null, error: `${fd.label}: "${v}" must be YYYY-MM` };
    case 'datetime': { const t = Date.parse(v.includes('T') || v.includes(' ') ? v.replace(' ', 'T') : `${v}T00:00:00Z`); return isNaN(t) ? { value: null, error: `${fd.label}: "${v}" is not a valid timestamp` } : { value: new Date(t).toISOString() }; }
    case 'ccy': return /^[A-Za-z]{3}$/.test(v) ? { value: v.toUpperCase() } : { value: null, error: `${fd.label}: "${v}" is not an ISO currency code` };
    case 'enum': { const x = v.toLowerCase(); return fd.values!.includes(x) ? { value: x } : { value: null, error: `${fd.label}: "${v}" must be one of ${fd.values!.join(', ')}` }; }
    default: return { value: v.slice(0, 500) };
  }
}

export function mapRow(kind: ImportKind, mapping: Record<string, string>, columns: string[], row: string[]): { values: Record<string, string | null>; errors: string[] } {
  const values: Record<string, string | null> = {}; const errors: string[] = [];
  for (const fd of KINDS[kind].fields) {
    const col = mapping[fd.key]; const idx = col ? columns.indexOf(col) : -1;
    const r = coerce(fd, idx >= 0 ? row[idx] : undefined);
    values[fd.key] = r.value; if (r.error) errors.push(r.error);
  }
  return { values, errors };
}
