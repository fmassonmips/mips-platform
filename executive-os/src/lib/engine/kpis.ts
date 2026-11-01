/**
 * KPI registry & calculation functions (KPI-ENGINE).
 *
 * Each KPI has a stable identifier, business definition, formula, numerator /
 * denominator definitions, source, grain, period basis, currency and rounding
 * rules. The registry is the single source of truth: it is synced into
 * kpi_definitions / formula_versions (with a formula hash), rendered as the
 * Formula Dictionary, and evaluated by computeKpis().
 */
import { createHash } from 'node:crypto';
import { dec, safeDiv, pctChange, ZERO, type Dec } from '../money';
import { economics, type RevenuePolicy } from './economics';
import { dso } from './aging';

export const KPI_ENGINE_VERSION = 'KPI-ENGINE-1.0.0';

export type Source = 'gl' | 'transactions' | 'bank' | 'ar' | 'budget' | 'ops' | 'cost_model' | 'pricing';

export interface TxnFacts { attempts: string; successes: string; gpv: string; mdr: string; wholesale: string; processing: string; saas: string }
export interface PeriodFacts {
  periodStart: string; periodEnd: string; days: number; policy: RevenuePolicy; currency: string;
  txn: TxnFacts;
  byAcquirer: Record<string, TxnFacts>;
  byMethod: Record<string, TxnFacts>;
  gl: { revenue: string; cost_of_sales: string; opex: string; d_and_a: string; finance_income: string; finance_costs: string; tax: string };
  cash: { operatingBalanceEnd: string; restrictedBalanceEnd: string; operatingNetFlow: string; capexOutflow: string; financingNetFlow: string };
  ar: { closing: string; creditSales: string };
  budget: { revenue: string | null; ebitda: string | null };
  ops: { activeMerchants: string; activeAtStart: string; newlyActivated: string; churned: string; onboardingAvgDays: string | null; pendingOnboarding: string; incidents: string; uptimeAvg: string | null };
}

export interface KpiDef {
  code: string; name: string; category: 'financial' | 'payments' | 'operations';
  unit: 'money' | 'percent' | 'count' | 'ratio' | 'days' | 'bps';
  direction: 'up' | 'down' | 'neutral';
  definition: string; formula: string; numerator?: string; denominator?: string;
  sources: Source[]; dataSource: string; grain: string; periodBasis: string; currencyRule: string; rounding: string;
  owner: string; validation: string[]; materialityPct?: number;
  dimension?: 'acquirer' | 'method';
  compute: (f: PeriodFacts, prior: PeriodFacts | null) => { value: Dec | null; inputs: Record<string, string | null>; note?: string };
}

const MONEY = 'Base currency (tenant); foreign-currency items converted at transaction-date FX reference';
const R_MONEY = 'Stored 8 dp; displayed ROUND_HALF_UP to 0 dp';
const R_PCT = 'Stored as fraction 8 dp; displayed as % to 1 dp';
const glEbitda = (f: PeriodFacts) => dec(f.gl.revenue).minus(f.gl.cost_of_sales).minus(f.gl.opex);
const econ = (f: PeriodFacts, t: TxnFacts = f.txn) => economics({ gpv: t.gpv, mdr: t.mdr, wholesale: t.wholesale, processing: t.processing, saas: t.saas, attempts: t.attempts, successes: t.successes }, f.policy);
const s = (v: Dec | null | undefined) => (v === null || v === undefined ? null : v.toString());

export const KPIS: KpiDef[] = [
  // ------------------------------ FINANCIAL (general ledger) ------------------------------
  { code: 'FIN.REVENUE', name: 'Revenue', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Revenue recognised in the general ledger for the period under the tenant revenue-recognition policy. Excludes funds processed on behalf of merchants.',
    formula: 'Σ credit − debit on accounts mapped to P&L line "revenue"', sources: ['gl'], dataSource: 'gl_entries ⨝ chart_of_accounts (pl_line = revenue)', grain: 'Tenant × period', periodBasis: 'GL entry period (accounting date)', currencyRule: MONEY, rounding: R_MONEY,
    validation: ['GL revenue must reconcile to transaction-derived revenue within tolerance', 'Journals must balance'],
    compute: (f) => ({ value: dec(f.gl.revenue), inputs: { gl_revenue: f.gl.revenue } }) },
  { code: 'FIN.REVENUE_GROWTH', name: 'Revenue growth', category: 'financial', unit: 'percent', direction: 'up', owner: 'CFO',
    definition: 'Change in GL revenue versus the immediately preceding period of equal length.', formula: '(Revenue_t − Revenue_t−1) / |Revenue_t−1|', numerator: 'Revenue_t − Revenue_t−1', denominator: '|Revenue_t−1|',
    sources: ['gl'], dataSource: 'FIN.REVENUE for current and prior period', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_PCT, validation: ['Prior period must have non-zero revenue'],
    compute: (f, p) => { const prev = p ? dec(p.gl.revenue) : null; return { value: prev ? pctChange(f.gl.revenue, prev) : null, inputs: { revenue: f.gl.revenue, prior_revenue: s(prev) }, note: prev ? undefined : 'No prior period data' }; } },
  { code: 'FIN.GROSS_PROFIT', name: 'Gross profit', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Revenue less cost of sales.', formula: 'Revenue − Cost of sales', sources: ['gl'], dataSource: 'gl_entries (pl_line revenue, cost_of_sales)', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => ({ value: dec(f.gl.revenue).minus(f.gl.cost_of_sales), inputs: { revenue: f.gl.revenue, cost_of_sales: f.gl.cost_of_sales } }) },
  { code: 'FIN.GROSS_MARGIN', name: 'Gross margin', category: 'financial', unit: 'percent', direction: 'up', owner: 'CFO',
    definition: 'Gross profit as a share of revenue.', formula: 'Gross profit / Revenue', numerator: 'Gross profit', denominator: 'Revenue', sources: ['gl'], dataSource: 'gl_entries', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_PCT, validation: ['Denominator must be non-zero'],
    compute: (f) => { const gp = dec(f.gl.revenue).minus(f.gl.cost_of_sales); return { value: safeDiv(gp, f.gl.revenue), inputs: { gross_profit: gp.toString(), revenue: f.gl.revenue } }; } },
  { code: 'FIN.EBITDA', name: 'EBITDA', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Earnings before interest, tax, depreciation and amortisation.', formula: 'Revenue − Cost of sales − Operating expenses (excl. D&A)', sources: ['gl'], dataSource: 'gl_entries', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => ({ value: glEbitda(f), inputs: { revenue: f.gl.revenue, cost_of_sales: f.gl.cost_of_sales, opex: f.gl.opex } }) },
  { code: 'FIN.OPERATING_PROFIT', name: 'Operating profit', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'EBITDA less depreciation and amortisation.', formula: 'EBITDA − D&A', sources: ['gl'], dataSource: 'gl_entries', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => ({ value: glEbitda(f).minus(f.gl.d_and_a), inputs: { ebitda: glEbitda(f).toString(), d_and_a: f.gl.d_and_a } }) },
  { code: 'FIN.PBT', name: 'Profit before tax', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Operating profit plus finance income less finance costs.', formula: 'Operating profit + Finance income − Finance costs', sources: ['gl'], dataSource: 'gl_entries', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => { const op = glEbitda(f).minus(f.gl.d_and_a); return { value: op.plus(f.gl.finance_income).minus(f.gl.finance_costs), inputs: { operating_profit: op.toString(), finance_income: f.gl.finance_income, finance_costs: f.gl.finance_costs } }; } },
  { code: 'FIN.NET_PROFIT', name: 'Net profit', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Profit before tax less income tax expense.', formula: 'PBT − Tax', sources: ['gl'], dataSource: 'gl_entries', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => { const pbt = glEbitda(f).minus(f.gl.d_and_a).plus(f.gl.finance_income).minus(f.gl.finance_costs); return { value: pbt.minus(f.gl.tax), inputs: { pbt: pbt.toString(), tax: f.gl.tax } }; } },
  { code: 'FIN.CASH_BALANCE', name: 'Cash balance (unrestricted)', category: 'financial', unit: 'money', direction: 'up', owner: 'Treasury',
    definition: 'Closing balance of OPERATING bank accounts. Restricted, safeguarded and merchant settlement funds are excluded.', formula: 'Σ opening balance + Σ bank transactions ≤ period end (account_class = operating)',
    sources: ['bank'], dataSource: 'bank_accounts ⨝ bank_transactions', grain: 'Tenant × period end', periodBasis: 'Bank transaction date', currencyRule: MONEY, rounding: R_MONEY, validation: ['Restricted/merchant funds excluded'],
    compute: (f) => ({ value: dec(f.cash.operatingBalanceEnd), inputs: { operating_balance: f.cash.operatingBalanceEnd, restricted_excluded: f.cash.restrictedBalanceEnd } }) },
  { code: 'FIN.FREE_CASH_FLOW', name: 'Free cash flow', category: 'financial', unit: 'money', direction: 'up', owner: 'Treasury',
    definition: 'Net change in operating cash excluding financing flows (loans, equity). Capex outflows are included (deducted).', formula: 'Operating-account net flow − Financing net flow',
    sources: ['bank'], dataSource: 'bank_transactions (operating accounts, category ≠ loan/equity)', grain: 'Tenant × period', periodBasis: 'Bank transaction date', currencyRule: MONEY, rounding: R_MONEY, validation: ['Bank transactions categorised'],
    compute: (f) => ({ value: dec(f.cash.operatingNetFlow).minus(f.cash.financingNetFlow), inputs: { operating_net_flow: f.cash.operatingNetFlow, financing_net_flow: f.cash.financingNetFlow, capex_outflow: f.cash.capexOutflow } }) },
  { code: 'FIN.AR', name: 'Accounts receivable', category: 'financial', unit: 'money', direction: 'down', owner: 'Finance Manager',
    definition: 'Outstanding (unpaid, non-void) customer invoices at period end, in base currency.', formula: 'Σ (amount − amount_paid) × FX for invoices issued ≤ period end and not paid by period end',
    sources: ['ar'], dataSource: 'customer_invoices', grain: 'Tenant × period end', periodBasis: 'Invoice issue date / paid date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => ({ value: dec(f.ar.closing), inputs: { closing_ar: f.ar.closing } }) },
  { code: 'FIN.DSO', name: 'Days sales outstanding', category: 'financial', unit: 'days', direction: 'down', owner: 'Finance Manager',
    definition: 'Average collection period.', formula: 'Closing AR / Credit sales in period × Days in period', numerator: 'Closing AR', denominator: 'Credit sales (invoiced) in period',
    sources: ['ar'], dataSource: 'customer_invoices', grain: 'Tenant × period', periodBasis: 'Invoice issue date', currencyRule: MONEY, rounding: 'Stored 8 dp; displayed 1 dp', validation: ['Credit sales must be non-zero'],
    compute: (f) => ({ value: dso(f.ar.closing, f.ar.creditSales, f.days), inputs: { closing_ar: f.ar.closing, credit_sales: f.ar.creditSales, days: String(f.days) } }) },
  { code: 'FIN.BUDGET_VARIANCE_EBITDA', name: 'EBITDA vs budget', category: 'financial', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Actual EBITDA less EBITDA in the latest approved budget version for the same periods.', formula: 'Actual EBITDA − Budget EBITDA',
    sources: ['gl', 'budget'], dataSource: 'gl_entries; budget_lines (approved version)', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: ['An approved budget version must exist'],
    compute: (f) => ({ value: f.budget.ebitda === null ? null : glEbitda(f).minus(f.budget.ebitda), inputs: { actual_ebitda: glEbitda(f).toString(), budget_ebitda: f.budget.ebitda }, note: f.budget.ebitda === null ? 'No approved budget for period' : undefined }) },
  { code: 'FIN.BUDGET_VARIANCE_REVENUE', name: 'Revenue vs budget', category: 'financial', unit: 'percent', direction: 'up', owner: 'CFO',
    definition: 'Percentage variance of actual GL revenue against the approved budget.', formula: '(Actual revenue − Budget revenue) / Budget revenue', numerator: 'Actual − Budget', denominator: 'Budget revenue',
    sources: ['gl', 'budget'], dataSource: 'gl_entries; budget_lines', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_PCT, validation: ['Budget must be approved'],
    compute: (f) => ({ value: f.budget.revenue === null ? null : pctChange(f.gl.revenue, f.budget.revenue), inputs: { actual_revenue: f.gl.revenue, budget_revenue: f.budget.revenue } }) },

  // ------------------------------ PAYMENTS (transaction engine) ------------------------------
  { code: 'PAY.GPV', name: 'Gross transaction value', category: 'payments', unit: 'money', direction: 'up', owner: 'Head of Payments',
    definition: 'Value of SUCCESSFUL payments processed on behalf of merchants. This is NOT MIPS revenue.', formula: 'Σ amount_base where status = success',
    sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period (× acquirer / method)', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: ['FX rate present for non-base currency', 'No duplicate external references'],
    compute: (f) => ({ value: dec(f.txn.gpv), inputs: { gpv: f.txn.gpv } }) },
  { code: 'PAY.TXN_COUNT', name: 'Transaction count (attempts)', category: 'payments', unit: 'count', direction: 'up', owner: 'Head of Payments',
    definition: 'All payment attempts (successful, failed, refunded, reversed).', formula: 'count(transactions)', sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: 'n/a', rounding: 'Integer', validation: [],
    compute: (f) => ({ value: dec(f.txn.attempts), inputs: { attempts: f.txn.attempts } }) },
  { code: 'PAY.SUCCESS_COUNT', name: 'Successful transactions', category: 'payments', unit: 'count', direction: 'up', owner: 'Head of Payments',
    definition: 'Count of successful payments.', formula: 'count(status = success)', sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: 'n/a', rounding: 'Integer', validation: [],
    compute: (f) => ({ value: dec(f.txn.successes), inputs: { successes: f.txn.successes } }) },
  { code: 'PAY.SUCCESS_RATE', name: 'Payment success rate', category: 'payments', unit: 'percent', direction: 'up', owner: 'Head of Payments',
    definition: 'Share of attempts that succeeded.', formula: 'Successful / Attempts', numerator: 'Successful transactions', denominator: 'All attempts', sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: 'n/a', rounding: R_PCT, validation: ['Attempts > 0'],
    compute: (f) => ({ value: safeDiv(f.txn.successes, f.txn.attempts), inputs: { successes: f.txn.successes, attempts: f.txn.attempts } }) },
  { code: 'PAY.FAILURE_RATE', name: 'Transaction failure rate', category: 'payments', unit: 'percent', direction: 'down', owner: 'CTO',
    definition: 'Share of attempts that did not succeed.', formula: '1 − Success rate', numerator: 'Attempts − Successful', denominator: 'Attempts', sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: 'n/a', rounding: R_PCT, validation: [],
    compute: (f) => ({ value: safeDiv(dec(f.txn.attempts).minus(f.txn.successes), f.txn.attempts), inputs: { attempts: f.txn.attempts, successes: f.txn.successes } }) },
  { code: 'PAY.ATV', name: 'Average transaction value', category: 'payments', unit: 'money', direction: 'neutral', owner: 'Head of Payments',
    definition: 'Average value of a successful payment.', formula: 'GPV / Successful transactions', numerator: 'GPV', denominator: 'Successful transactions', sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: 'Displayed 2 dp', validation: [],
    compute: (f) => ({ value: safeDiv(f.txn.gpv, f.txn.successes), inputs: { gpv: f.txn.gpv, successes: f.txn.successes } }) },
  { code: 'PAY.GROSS_FEES', name: 'Gross acquiring fees (MDR)', category: 'payments', unit: 'money', direction: 'up', owner: 'Head of Payments',
    definition: 'Merchant discount fees charged to merchants under effective-dated pricing agreements.', formula: 'Σ amount_base × MDR_bps / 10 000 + fixed fee (success only)', sources: ['transactions', 'pricing'], dataSource: 'transactions.mdr_fee_base (fee engine)', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: ['Every successful transaction has a pricing agreement'],
    compute: (f) => ({ value: dec(f.txn.mdr), inputs: { mdr: f.txn.mdr } }) },
  { code: 'PAY.WHOLESALE_COST', name: 'Wholesale acquiring cost', category: 'payments', unit: 'money', direction: 'down', owner: 'Head of Payments',
    definition: 'Acquirer wholesale fees under effective-dated fee schedules.', formula: 'Σ amount_base × wholesale_bps / 10 000 + fixed fee (success only)', sources: ['transactions', 'pricing'], dataSource: 'transactions.wholesale_fee_base', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: ['Every acquired transaction has a fee schedule'],
    compute: (f) => ({ value: dec(f.txn.wholesale), inputs: { wholesale: f.txn.wholesale } }) },
  { code: 'PAY.NET_REVENUE', name: 'Net payment revenue', category: 'payments', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Gross acquiring fees less wholesale cost plus SaaS fees — the economic revenue attributable to MIPS.', formula: 'MDR − Wholesale + SaaS', sources: ['transactions', 'pricing'], dataSource: 'transactions; pricing_agreements.monthly_saas_fee', grain: 'Tenant × period × acquirer/method', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: (f) => { const e = econ(f); return { value: e.netPaymentRevenue.plus(e.saas), inputs: { mdr: f.txn.mdr, wholesale: f.txn.wholesale, saas: f.txn.saas } }; } },
  { code: 'PAY.NET_REVENUE_BY_ACQUIRER', name: 'Net revenue by acquirer', category: 'payments', unit: 'money', direction: 'up', owner: 'CFO', dimension: 'acquirer',
    definition: 'Net payment revenue (MDR − wholesale) split by acquiring bank.', formula: 'MDR − Wholesale per acquirer', sources: ['transactions', 'pricing'], dataSource: 'transactions', grain: 'Tenant × period × acquirer', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: () => ({ value: null, inputs: {} }) },
  { code: 'PAY.NET_REVENUE_BY_METHOD', name: 'Net revenue by payment method', category: 'payments', unit: 'money', direction: 'up', owner: 'CFO', dimension: 'method',
    definition: 'Net payment revenue split by payment method.', formula: 'MDR − Wholesale per payment method', sources: ['transactions', 'pricing'], dataSource: 'transactions', grain: 'Tenant × period × method', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: [],
    compute: () => ({ value: null, inputs: {} }) },
  { code: 'PAY.REVENUE_PER_TXN', name: 'Revenue per successful transaction', category: 'payments', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Recognised transaction-engine revenue per successful payment (policy dependent).', formula: 'Recognised revenue / Successful transactions', numerator: 'Recognised revenue (policy)', denominator: 'Successful transactions', sources: ['transactions', 'pricing'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: 'Displayed 2 dp', validation: [],
    compute: (f) => { const e = econ(f); return { value: e.revenuePerTxn, inputs: { recognised_revenue: e.recognisedRevenue.toString(), successes: f.txn.successes, policy: f.policy } }; } },
  { code: 'PAY.COST_PER_TXN', name: 'Processing cost per transaction', category: 'payments', unit: 'money', direction: 'down', owner: 'CTO',
    definition: 'Wholesale plus direct processing cost per successful payment.', formula: '(Wholesale + Direct processing) / Successful transactions', numerator: 'Wholesale + processing', denominator: 'Successful transactions', sources: ['transactions', 'pricing', 'cost_model'], dataSource: 'transactions; processing_cost_rates (documented estimate)', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: 'Displayed 2 dp', validation: [],
    compute: (f) => { const e = econ(f); return { value: e.costPerTxn, inputs: { wholesale: f.txn.wholesale, processing: f.txn.processing, successes: f.txn.successes } }; } },
  { code: 'PAY.EFFECTIVE_MDR', name: 'Effective MDR', category: 'payments', unit: 'bps', direction: 'neutral', owner: 'Head of Payments',
    definition: 'Average merchant discount rate actually charged, in basis points.', formula: 'Gross fees / GPV × 10 000', numerator: 'Gross acquiring fees', denominator: 'GPV', sources: ['transactions', 'pricing'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: 'bps, 1 dp', validation: [],
    compute: (f) => { const r = safeDiv(f.txn.mdr, f.txn.gpv); return { value: r ? r.times(10000) : null, inputs: { mdr: f.txn.mdr, gpv: f.txn.gpv } }; } },
  { code: 'PAY.TAKE_RATE', name: 'Effective take rate', category: 'payments', unit: 'bps', direction: 'up', owner: 'CFO',
    definition: 'MIPS net take on processed value: (MDR − wholesale) / GPV, in basis points. Independent of revenue policy.', formula: '(Gross fees − Wholesale) / GPV × 10 000', numerator: 'Gross fees − wholesale', denominator: 'GPV', sources: ['transactions', 'pricing'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: 'bps, 1 dp', validation: [],
    compute: (f) => { const e = econ(f); return { value: e.effectiveTakeRate ? e.effectiveTakeRate.times(10000) : null, inputs: { net_payment_revenue: e.netPaymentRevenue.toString(), gpv: f.txn.gpv } }; } },
  { code: 'PAY.CONTRIBUTION', name: 'Contribution margin', category: 'payments', unit: 'money', direction: 'up', owner: 'CFO',
    definition: 'Gross fees − wholesale − direct processing cost + SaaS fees. Identical under agent and principal policies.', formula: 'MDR − Wholesale − Processing + SaaS', sources: ['transactions', 'pricing', 'cost_model'], dataSource: 'transactions; processing_cost_rates', grain: 'Tenant × period (× merchant)', periodBasis: 'Accounting date', currencyRule: MONEY, rounding: R_MONEY, validation: ['Σ merchant contribution = total contribution'],
    compute: (f) => { const e = econ(f); return { value: e.contributionMargin, inputs: { mdr: f.txn.mdr, wholesale: f.txn.wholesale, processing: f.txn.processing, saas: f.txn.saas } }; } },

  // ------------------------------ OPERATIONS ------------------------------
  { code: 'OPS.ACTIVE_MERCHANTS', name: 'Active merchants', category: 'operations', unit: 'count', direction: 'up', owner: 'COO',
    definition: 'Merchants with at least one successful transaction in the period.', formula: 'count(distinct merchant_id where status = success)', sources: ['transactions'], dataSource: 'transactions', grain: 'Tenant × period', periodBasis: 'Accounting date', currencyRule: 'n/a', rounding: 'Integer', validation: [],
    compute: (f) => ({ value: dec(f.ops.activeMerchants), inputs: { active: f.ops.activeMerchants } }) },
  { code: 'OPS.NEW_MERCHANTS', name: 'Newly activated merchants', category: 'operations', unit: 'count', direction: 'up', owner: 'COO',
    definition: 'Merchants whose activation date falls in the period.', formula: 'count(merchants.activated_at in period)', sources: ['ops'], dataSource: 'merchants', grain: 'Tenant × period', periodBasis: 'Activation date', currencyRule: 'n/a', rounding: 'Integer', validation: [],
    compute: (f) => ({ value: dec(f.ops.newlyActivated), inputs: { newly_activated: f.ops.newlyActivated } }) },
  { code: 'OPS.MERCHANT_CHURN', name: 'Merchant churn rate', category: 'operations', unit: 'percent', direction: 'down', owner: 'COO',
    definition: 'Merchants churned in the period divided by merchants active at the start of the period.', formula: 'Churned / Active at start', numerator: 'merchants.churned_at in period', denominator: 'Merchants activated before period start and not churned before it', sources: ['ops'], dataSource: 'merchants', grain: 'Tenant × period', periodBasis: 'Churn date', currencyRule: 'n/a', rounding: R_PCT, validation: [],
    compute: (f) => ({ value: safeDiv(f.ops.churned, f.ops.activeAtStart), inputs: { churned: f.ops.churned, active_at_start: f.ops.activeAtStart } }) },
  { code: 'OPS.ONBOARDING_DAYS', name: 'Merchant onboarding duration', category: 'operations', unit: 'days', direction: 'down', owner: 'COO',
    definition: 'Average days from application to activation for cases closed in the period.', formula: 'avg(closed_at − opened_at) for activated cases closed in period', sources: ['ops'], dataSource: 'onboarding_cases', grain: 'Tenant × period', periodBasis: 'Case close date', currencyRule: 'n/a', rounding: '1 dp', validation: [],
    compute: (f) => ({ value: f.ops.onboardingAvgDays === null ? null : dec(f.ops.onboardingAvgDays), inputs: { avg_days: f.ops.onboardingAvgDays } }) },
  { code: 'OPS.PENDING_ONBOARDING', name: 'Pending onboarding cases', category: 'operations', unit: 'count', direction: 'down', owner: 'COO',
    definition: 'Onboarding cases open at period end.', formula: 'count(opened_at ≤ end and (closed_at is null or closed_at > end))', sources: ['ops'], dataSource: 'onboarding_cases', grain: 'Tenant × period end', periodBasis: 'Case dates', currencyRule: 'n/a', rounding: 'Integer', validation: [],
    compute: (f) => ({ value: dec(f.ops.pendingOnboarding), inputs: { pending: f.ops.pendingOnboarding } }) },
  { code: 'OPS.SUPPORT_INCIDENTS', name: 'Support incidents', category: 'operations', unit: 'count', direction: 'down', owner: 'COO',
    definition: 'Incidents opened in the period.', formula: 'count(support_incidents.opened_at in period)', sources: ['ops'], dataSource: 'support_incidents', grain: 'Tenant × period', periodBasis: 'Open date', currencyRule: 'n/a', rounding: 'Integer', validation: [],
    compute: (f) => ({ value: dec(f.ops.incidents), inputs: { incidents: f.ops.incidents } }) },
  { code: 'OPS.UPTIME', name: 'Platform uptime', category: 'operations', unit: 'percent', direction: 'up', owner: 'CTO',
    definition: 'Average daily gateway availability.', formula: 'avg(uptime_pct) / 100', sources: ['ops'], dataSource: 'platform_uptime', grain: 'Tenant × period', periodBasis: 'Day', currencyRule: 'n/a', rounding: '3 dp', validation: [],
    compute: (f) => ({ value: f.ops.uptimeAvg === null ? null : dec(f.ops.uptimeAvg).div(100), inputs: { uptime_avg_pct: f.ops.uptimeAvg } }) },
];

export const KPI_BY_CODE = Object.fromEntries(KPIS.map((k) => [k.code, k])) as Record<string, KpiDef>;

/** Hash of everything that defines a formula: used to detect inconsistent formulas. */
export function formulaHash(k: KpiDef): string {
  return createHash('sha256').update(JSON.stringify([k.code, k.formula, k.numerator ?? '', k.denominator ?? '', k.dataSource, k.periodBasis, k.currencyRule, k.rounding, KPI_ENGINE_VERSION])).digest('hex');
}

export interface KpiValue { code: string; dimension: string; value: string | null; inputs: Record<string, string | null>; note?: string }

export function computeKpis(f: PeriodFacts, prior: PeriodFacts | null): KpiValue[] {
  const out: KpiValue[] = [];
  for (const k of KPIS) {
    if (k.dimension) {
      const src = k.dimension === 'acquirer' ? f.byAcquirer : f.byMethod;
      for (const [key, t] of Object.entries(src)) {
        const net = dec(t.mdr).minus(t.wholesale);
        out.push({ code: k.code, dimension: `${k.dimension}:${key}`, value: net.toString(), inputs: { mdr: t.mdr, wholesale: t.wholesale, gpv: t.gpv, successes: t.successes } });
      }
      continue;
    }
    const r = k.compute(f, prior);
    out.push({ code: k.code, dimension: 'total', value: r.value === null ? null : r.value.toDecimalPlaces(8).toString(), inputs: r.inputs, note: r.note ?? (r.value === null ? 'Not computable (zero or missing denominator)' : undefined) });
  }
  return out;
}

export function emptyTxnFacts(): TxnFacts { return { attempts: '0', successes: '0', gpv: '0', mdr: '0', wholesale: '0', processing: '0', saas: '0' }; }
export { ZERO };
