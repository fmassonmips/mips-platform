# Financial Formula Dictionary

Generated from `src/lib/engine/kpis.ts` (KPI-ENGINE-1.0.0) by `npm run docs:formulas`. Do not edit by hand.

## Global calculation policies

- **Arithmetic**: Decimal.js, 40 significant digits. Binary floating point is never used for money.
- **Storage precision**: money `numeric(20,4)`, KPI values `numeric(28,8)`, FX rates `numeric(20,10)`, basis points `numeric(10,4)`.
- **Rounding**: ROUND_HALF_UP; presentation to the currency minor unit (MUR 0 dp on dashboards, 2 dp in drill-downs).
- **Basis points**: 1 bp = 0.01 percentage point = 0.0001. A 20 bps reduction of 1.95 % gives 1.75 %.
- **Currency**: every foreign-currency record stores its own FX rate to the tenant base currency (`fx_rate_to_base`); `amount_base = round(amount × rate, 4)`. Control C04 verifies this.
- **Zero denominators**: ratio KPIs return NULL ("not computable"), never ∞/NaN.
- **Dates**: KPIs use the accounting date; transactions also store event (authorisation), processing and settlement dates.
- **GPV is never revenue**. Revenue recognition policy is a tenant setting: `agent_net` (revenue = MDR − wholesale + SaaS) or `principal_gross` (revenue = MDR + SaaS; wholesale in cost of sales). Contribution margin is identical under both.
- **Fee engine** (`src/lib/engine/fees.ts`): only successful transactions earn MDR / incur wholesale; every attempt incurs direct processing cost; most specific effective agreement wins (method > all; region > any; latest effective_from).
- **Confidence classes**: VERIFIED (controls pass and periods locked, or management verification for identical inputs), PENDING, DISPUTED (a control affecting the KPI’s sources fails), ESTIMATED (depends on the processing-cost model). Not an external audit opinion.

## KPI register

### FIN.REVENUE — Revenue

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Revenue recognised in the general ledger for the period under the tenant revenue-recognition policy. Excludes funds processed on behalf of merchants. |
| Formula | `Σ credit − debit on accounts mapped to P&L line "revenue"` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries ⨝ chart_of_accounts (pl_line = revenue) |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | GL entry period (accounting date) |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | GL revenue must reconcile to transaction-derived revenue within tolerance; Journals must balance |
| Owner | CFO |
| Formula hash | `3876398df56c3284…` |

### FIN.REVENUE_GROWTH — Revenue growth

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Change in GL revenue versus the immediately preceding period of equal length. |
| Formula | `(Revenue_t − Revenue_t−1) / |Revenue_t−1|` |
| Numerator | Revenue_t − Revenue_t−1 |
| Denominator | |Revenue_t−1| |
| Unit | percent (desired direction: up) |
| Data source | FIN.REVENUE for current and prior period |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored as fraction 8 dp; displayed as % to 1 dp |
| Validation rules | Prior period must have non-zero revenue |
| Owner | CFO |
| Formula hash | `b23e54527faf1caf…` |

### FIN.GROSS_PROFIT — Gross profit

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Revenue less cost of sales. |
| Formula | `Revenue − Cost of sales` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries (pl_line revenue, cost_of_sales) |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `260643acc92dfa5a…` |

### FIN.GROSS_MARGIN — Gross margin

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Gross profit as a share of revenue. |
| Formula | `Gross profit / Revenue` |
| Numerator | Gross profit |
| Denominator | Revenue |
| Unit | percent (desired direction: up) |
| Data source | gl_entries |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored as fraction 8 dp; displayed as % to 1 dp |
| Validation rules | Denominator must be non-zero |
| Owner | CFO |
| Formula hash | `d8ae191d936c0df1…` |

### FIN.EBITDA — EBITDA

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Earnings before interest, tax, depreciation and amortisation. |
| Formula | `Revenue − Cost of sales − Operating expenses (excl. D&A)` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `3632e8b8aea41870…` |

### FIN.OPERATING_PROFIT — Operating profit

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | EBITDA less depreciation and amortisation. |
| Formula | `EBITDA − D&A` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `11e88297f36132c5…` |

### FIN.PBT — Profit before tax

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Operating profit plus finance income less finance costs. |
| Formula | `Operating profit + Finance income − Finance costs` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `49ccb56f922d4036…` |

### FIN.NET_PROFIT — Net profit

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Profit before tax less income tax expense. |
| Formula | `PBT − Tax` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries |
| Source classes | gl |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `e2c530878e029b24…` |

### FIN.CASH_BALANCE — Cash balance (unrestricted)

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Closing balance of OPERATING bank accounts. Restricted, safeguarded and merchant settlement funds are excluded. |
| Formula | `Σ opening balance + Σ bank transactions ≤ period end (account_class = operating)` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | bank_accounts ⨝ bank_transactions |
| Source classes | bank |
| Grain | Tenant × period end |
| Period basis | Bank transaction date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | Restricted/merchant funds excluded |
| Owner | Treasury |
| Formula hash | `240162705c71e47a…` |

### FIN.FREE_CASH_FLOW — Free cash flow

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Net change in operating cash excluding financing flows (loans, equity). Capex outflows are included (deducted). |
| Formula | `Operating-account net flow − Financing net flow` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | bank_transactions (operating accounts, category ≠ loan/equity) |
| Source classes | bank |
| Grain | Tenant × period |
| Period basis | Bank transaction date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | Bank transactions categorised |
| Owner | Treasury |
| Formula hash | `a8c02f9c6bcffe63…` |

### FIN.AR — Accounts receivable

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Outstanding (unpaid, non-void) customer invoices at period end, in base currency. |
| Formula | `Σ (amount − amount_paid) × FX for invoices issued ≤ period end and not paid by period end` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: down) |
| Data source | customer_invoices |
| Source classes | ar |
| Grain | Tenant × period end |
| Period basis | Invoice issue date / paid date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | Finance Manager |
| Formula hash | `931baf5834befe50…` |

### FIN.DSO — Days sales outstanding

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Average collection period. |
| Formula | `Closing AR / Credit sales in period × Days in period` |
| Numerator | Closing AR |
| Denominator | Credit sales (invoiced) in period |
| Unit | days (desired direction: down) |
| Data source | customer_invoices |
| Source classes | ar |
| Grain | Tenant × period |
| Period basis | Invoice issue date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed 1 dp |
| Validation rules | Credit sales must be non-zero |
| Owner | Finance Manager |
| Formula hash | `4924679580bf208c…` |

### FIN.BUDGET_VARIANCE_EBITDA — EBITDA vs budget

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Actual EBITDA less EBITDA in the latest approved budget version for the same periods. |
| Formula | `Actual EBITDA − Budget EBITDA` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | gl_entries; budget_lines (approved version) |
| Source classes | gl, budget |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | An approved budget version must exist |
| Owner | CFO |
| Formula hash | `8418fa81bcf21103…` |

### FIN.BUDGET_VARIANCE_REVENUE — Revenue vs budget

| Attribute | Value |
|---|---|
| Category | financial |
| Definition | Percentage variance of actual GL revenue against the approved budget. |
| Formula | `(Actual revenue − Budget revenue) / Budget revenue` |
| Numerator | Actual − Budget |
| Denominator | Budget revenue |
| Unit | percent (desired direction: up) |
| Data source | gl_entries; budget_lines |
| Source classes | gl, budget |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored as fraction 8 dp; displayed as % to 1 dp |
| Validation rules | Budget must be approved |
| Owner | CFO |
| Formula hash | `c0c656cd13a0bf41…` |

### PAY.GPV — Gross transaction value

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Value of SUCCESSFUL payments processed on behalf of merchants. This is NOT MIPS revenue. |
| Formula | `Σ amount_base where status = success` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period (× acquirer / method) |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | FX rate present for non-base currency; No duplicate external references |
| Owner | Head of Payments |
| Formula hash | `ac3809aeaa1176a7…` |

### PAY.TXN_COUNT — Transaction count (attempts)

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | All payment attempts (successful, failed, refunded, reversed). |
| Formula | `count(transactions)` |
| Numerator | — |
| Denominator | — |
| Unit | count (desired direction: up) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | n/a |
| Rounding | Integer |
| Validation rules | — |
| Owner | Head of Payments |
| Formula hash | `1904deb2d7937aff…` |

### PAY.SUCCESS_COUNT — Successful transactions

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Count of successful payments. |
| Formula | `count(status = success)` |
| Numerator | — |
| Denominator | — |
| Unit | count (desired direction: up) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | n/a |
| Rounding | Integer |
| Validation rules | — |
| Owner | Head of Payments |
| Formula hash | `3100f7758023c146…` |

### PAY.SUCCESS_RATE — Payment success rate

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Share of attempts that succeeded. |
| Formula | `Successful / Attempts` |
| Numerator | Successful transactions |
| Denominator | All attempts |
| Unit | percent (desired direction: up) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | n/a |
| Rounding | Stored as fraction 8 dp; displayed as % to 1 dp |
| Validation rules | Attempts > 0 |
| Owner | Head of Payments |
| Formula hash | `89d9a6eb68db2afc…` |

### PAY.FAILURE_RATE — Transaction failure rate

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Share of attempts that did not succeed. |
| Formula | `1 − Success rate` |
| Numerator | Attempts − Successful |
| Denominator | Attempts |
| Unit | percent (desired direction: down) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | n/a |
| Rounding | Stored as fraction 8 dp; displayed as % to 1 dp |
| Validation rules | — |
| Owner | CTO |
| Formula hash | `84f029528d513e28…` |

### PAY.ATV — Average transaction value

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Average value of a successful payment. |
| Formula | `GPV / Successful transactions` |
| Numerator | GPV |
| Denominator | Successful transactions |
| Unit | money (desired direction: neutral) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Displayed 2 dp |
| Validation rules | — |
| Owner | Head of Payments |
| Formula hash | `b58bf6e262d9ce8e…` |

### PAY.GROSS_FEES — Gross acquiring fees (MDR)

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Merchant discount fees charged to merchants under effective-dated pricing agreements. |
| Formula | `Σ amount_base × MDR_bps / 10 000 + fixed fee (success only)` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | transactions.mdr_fee_base (fee engine) |
| Source classes | transactions, pricing |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | Every successful transaction has a pricing agreement |
| Owner | Head of Payments |
| Formula hash | `19a9d84720622f04…` |

### PAY.WHOLESALE_COST — Wholesale acquiring cost

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Acquirer wholesale fees under effective-dated fee schedules. |
| Formula | `Σ amount_base × wholesale_bps / 10 000 + fixed fee (success only)` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: down) |
| Data source | transactions.wholesale_fee_base |
| Source classes | transactions, pricing |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | Every acquired transaction has a fee schedule |
| Owner | Head of Payments |
| Formula hash | `7c7ab103358bdd51…` |

### PAY.NET_REVENUE — Net payment revenue

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Gross acquiring fees less wholesale cost plus SaaS fees — the economic revenue attributable to MIPS. |
| Formula | `MDR − Wholesale + SaaS` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | transactions; pricing_agreements.monthly_saas_fee |
| Source classes | transactions, pricing |
| Grain | Tenant × period × acquirer/method |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `322d34da7eb859ab…` |

### PAY.NET_REVENUE_BY_ACQUIRER — Net revenue by acquirer

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Net payment revenue (MDR − wholesale) split by acquiring bank. |
| Formula | `MDR − Wholesale per acquirer` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | transactions |
| Source classes | transactions, pricing |
| Grain | Tenant × period × acquirer |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `0443e49d3b5099f6…` |

### PAY.NET_REVENUE_BY_METHOD — Net revenue by payment method

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Net payment revenue split by payment method. |
| Formula | `MDR − Wholesale per payment method` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | transactions |
| Source classes | transactions, pricing |
| Grain | Tenant × period × method |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `065f1cc89cda519f…` |

### PAY.REVENUE_PER_TXN — Revenue per successful transaction

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Recognised transaction-engine revenue per successful payment (policy dependent). |
| Formula | `Recognised revenue / Successful transactions` |
| Numerator | Recognised revenue (policy) |
| Denominator | Successful transactions |
| Unit | money (desired direction: up) |
| Data source | transactions |
| Source classes | transactions, pricing |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Displayed 2 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `3c0f906f40241707…` |

### PAY.COST_PER_TXN — Processing cost per transaction

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Wholesale plus direct processing cost per successful payment. |
| Formula | `(Wholesale + Direct processing) / Successful transactions` |
| Numerator | Wholesale + processing |
| Denominator | Successful transactions |
| Unit | money (desired direction: down) |
| Data source | transactions; processing_cost_rates (documented estimate) |
| Source classes | transactions, pricing, cost_model |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Displayed 2 dp |
| Validation rules | — |
| Owner | CTO |
| Formula hash | `9d632c5c4f2ec09a…` |

### PAY.EFFECTIVE_MDR — Effective MDR

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Average merchant discount rate actually charged, in basis points. |
| Formula | `Gross fees / GPV × 10 000` |
| Numerator | Gross acquiring fees |
| Denominator | GPV |
| Unit | bps (desired direction: neutral) |
| Data source | transactions |
| Source classes | transactions, pricing |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | bps, 1 dp |
| Validation rules | — |
| Owner | Head of Payments |
| Formula hash | `229102fd787f4027…` |

### PAY.TAKE_RATE — Effective take rate

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | MIPS net take on processed value: (MDR − wholesale) / GPV, in basis points. Independent of revenue policy. |
| Formula | `(Gross fees − Wholesale) / GPV × 10 000` |
| Numerator | Gross fees − wholesale |
| Denominator | GPV |
| Unit | bps (desired direction: up) |
| Data source | transactions |
| Source classes | transactions, pricing |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | bps, 1 dp |
| Validation rules | — |
| Owner | CFO |
| Formula hash | `2daa7fdab392bbfd…` |

### PAY.CONTRIBUTION — Contribution margin

| Attribute | Value |
|---|---|
| Category | payments |
| Definition | Gross fees − wholesale − direct processing cost + SaaS fees. Identical under agent and principal policies. |
| Formula | `MDR − Wholesale − Processing + SaaS` |
| Numerator | — |
| Denominator | — |
| Unit | money (desired direction: up) |
| Data source | transactions; processing_cost_rates |
| Source classes | transactions, pricing, cost_model |
| Grain | Tenant × period (× merchant) |
| Period basis | Accounting date |
| Currency | Base currency (tenant); foreign-currency items converted at transaction-date FX reference |
| Rounding | Stored 8 dp; displayed ROUND_HALF_UP to 0 dp |
| Validation rules | Σ merchant contribution = total contribution |
| Owner | CFO |
| Formula hash | `b1af6e3cbeb89e65…` |

### OPS.ACTIVE_MERCHANTS — Active merchants

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Merchants with at least one successful transaction in the period. |
| Formula | `count(distinct merchant_id where status = success)` |
| Numerator | — |
| Denominator | — |
| Unit | count (desired direction: up) |
| Data source | transactions |
| Source classes | transactions |
| Grain | Tenant × period |
| Period basis | Accounting date |
| Currency | n/a |
| Rounding | Integer |
| Validation rules | — |
| Owner | COO |
| Formula hash | `d0c4632eed8cf054…` |

### OPS.NEW_MERCHANTS — Newly activated merchants

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Merchants whose activation date falls in the period. |
| Formula | `count(merchants.activated_at in period)` |
| Numerator | — |
| Denominator | — |
| Unit | count (desired direction: up) |
| Data source | merchants |
| Source classes | ops |
| Grain | Tenant × period |
| Period basis | Activation date |
| Currency | n/a |
| Rounding | Integer |
| Validation rules | — |
| Owner | COO |
| Formula hash | `0d9794bfa394b753…` |

### OPS.MERCHANT_CHURN — Merchant churn rate

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Merchants churned in the period divided by merchants active at the start of the period. |
| Formula | `Churned / Active at start` |
| Numerator | merchants.churned_at in period |
| Denominator | Merchants activated before period start and not churned before it |
| Unit | percent (desired direction: down) |
| Data source | merchants |
| Source classes | ops |
| Grain | Tenant × period |
| Period basis | Churn date |
| Currency | n/a |
| Rounding | Stored as fraction 8 dp; displayed as % to 1 dp |
| Validation rules | — |
| Owner | COO |
| Formula hash | `2d8efcc6ee9d9200…` |

### OPS.ONBOARDING_DAYS — Merchant onboarding duration

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Average days from application to activation for cases closed in the period. |
| Formula | `avg(closed_at − opened_at) for activated cases closed in period` |
| Numerator | — |
| Denominator | — |
| Unit | days (desired direction: down) |
| Data source | onboarding_cases |
| Source classes | ops |
| Grain | Tenant × period |
| Period basis | Case close date |
| Currency | n/a |
| Rounding | 1 dp |
| Validation rules | — |
| Owner | COO |
| Formula hash | `593dc49e8106db32…` |

### OPS.PENDING_ONBOARDING — Pending onboarding cases

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Onboarding cases open at period end. |
| Formula | `count(opened_at ≤ end and (closed_at is null or closed_at > end))` |
| Numerator | — |
| Denominator | — |
| Unit | count (desired direction: down) |
| Data source | onboarding_cases |
| Source classes | ops |
| Grain | Tenant × period end |
| Period basis | Case dates |
| Currency | n/a |
| Rounding | Integer |
| Validation rules | — |
| Owner | COO |
| Formula hash | `e6dc8729bde35f00…` |

### OPS.SUPPORT_INCIDENTS — Support incidents

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Incidents opened in the period. |
| Formula | `count(support_incidents.opened_at in period)` |
| Numerator | — |
| Denominator | — |
| Unit | count (desired direction: down) |
| Data source | support_incidents |
| Source classes | ops |
| Grain | Tenant × period |
| Period basis | Open date |
| Currency | n/a |
| Rounding | Integer |
| Validation rules | — |
| Owner | COO |
| Formula hash | `463f445c2f8c0ad5…` |

### OPS.UPTIME — Platform uptime

| Attribute | Value |
|---|---|
| Category | operations |
| Definition | Average daily gateway availability. |
| Formula | `avg(uptime_pct) / 100` |
| Numerator | — |
| Denominator | — |
| Unit | percent (desired direction: up) |
| Data source | platform_uptime |
| Source classes | ops |
| Grain | Tenant × period |
| Period basis | Day |
| Currency | n/a |
| Rounding | 3 dp |
| Validation rules | — |
| Owner | CTO |
| Formula hash | `221ac8c0a714fdff…` |

## Controls (Formula Audit)

| Code | Check | Category |
|---|---|---|
| C01 | Missing pricing / fee schedule | Missing values |
| C02 | Probable duplicates (same merchant & amount within 60 s) | Duplicate records |
| C03 | Σ merchant contribution = total | Incorrect aggregation |
| C04 | FX: base amount = amount × stored rate | Currency errors |
| C05 | Denominators | Invalid denominators |
| C06 | Formula hash matches registered version | Inconsistent formulas |
| C07 | GL transaction revenue ↔ fee-engine revenue per month (tolerance setting) | Reconciliation discrepancies |
| C08 | Open bank reconciliation exceptions | Reconciliation discrepancies |
| C09 | Event ≤ settlement / accounting dates | Period misalignment |
| C10 | Journals balance | Incorrect aggregation |
| C11 | GL present for every completed month | Missing values |

## Scenario templates (SCENARIO-1.0.0)

Outputs per case (base = status quo, proposed, downside): incremental revenue, costs, contribution, EBITDA, PBT (EBITDA − incremental D&A), cash flow (EBITDA − capex − working capital − tax), payback month, break-even GPV change, sensitivities (revenue ±10 %, costs +10 %, 3-month delay), risk exposure (downside − proposed cash).

| Template | Description | Assumptions |
|---|---|---|
| `merchant_repricing` | Change MDR / wholesale / acquirer routing for one merchant, using its trailing actual economics. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, merchantId, mdrChangeBps, wholesaleChangeBps, migrateShare, migrateWholesaleDeltaBps, volumeGrowthPct, churnProbability, oneOffCost |
| `portfolio_mdr_change` | Apply an MDR change in bps across the portfolio with an assumed volume response. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, mdrChangeBps, volumeGrowthPct, churnProbability |
| `hire_role` | Monthly loaded cost, recruitment cost and an expected contribution uplift after ramp-up. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, roleTitle, headcount, monthlyLoadedCost, recruitmentCost, monthlyContributionUplift, rampMonths |
| `automate_onboarding` | Investment that shortens onboarding and adds activations; saves manual effort. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, investment, usefulLifeMonths, monthlyRunCost, extraActivationsPerMonth, monthlyStaffSaving, onboardingDaysBefore, onboardingDaysAfter, rampMonths |
| `merchant_acquisition` | Additional merchants per month at the current average contribution per merchant. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, newMerchantsPerMonth, acquisitionCostPerMerchant, monthlySalesCost, rampMonths |
| `launch_softpos` | New acceptance product: capex, run cost, adoption and unit economics. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, capex, usefulLifeMonths, monthlyRunCost, merchantsAdoptingPerMonth, gpvPerMerchantMonthly, mdrBps, wholesaleBps, processingCostPerTxn, avgTicket, maxMerchants |
| `new_saas_service` | Subscription revenue from merchant adoption. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, pricePerMerchantMonthly, adoptionPerMonth, maxAdopters, monthlyRunCost, developmentCost, usefulLifeMonths |
| `acquirer_migration` | Route a share of GPV to an acquirer with different wholesale cost. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, migrateShare, wholesaleDeltaBps, migrationCost, successRateDeltaPct |
| `market_expansion` | Setup cost, fixed run cost and revenue ramp to a steady state. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, setupCost, monthlyFixedCost, steadyStateMonthlyRevenue, contributionMarginPct, rampMonths |
| `infrastructure_investment` | Capex that changes run cost and processing cost per transaction. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, capex, usefulLifeMonths, monthlyRunCostChange, processingCostChangePerTxn, successRateDeltaPct |
| `lose_strategic_merchant` | Remove a merchant’s trailing contribution and receivables risk. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, merchantId, monthsUntilLoss, writeOffReceivables |
| `collection_delay` | Working-capital effect of slower collections (no P&L effect unless bad debt). | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, extraDays, badDebtPct |
| `regulatory_change` | One-off compliance spend, recurring cost and additional capital to be held. | horizonMonths, downsideRevenueHaircut, downsideCostOverrun, downsideDelayMonths, taxRate, oneOffCost, monthlyCost, additionalCapitalHeld |

## Other engine formulas

- **Break-even GPV** = (fixed costs − SaaS) ÷ variable contribution per unit of GPV; **cash break-even** excludes D&A and adds cash-only fixed outflows. Required take rate = (fixed + processing − SaaS) ÷ GPV.
- **Runway**: unrestricted cash ÷ average monthly operating burn; when average net flow ≥ 0 the business is cash-generative and no finite runway is shown.
- **13-week forecast**: receipts at due/promise date + scenario delay × collection rate (disputed at the disputed rate); payables at scheduled/due date; recurring items; restricted funds excluded.
- **Revenue bridge**: new + lost merchants + volume effect Σ(ΔGPV × prior take) + rate effect Σ(Δtake × current GPV) + SaaS/other; volume split into transaction-count and average-ticket effects; sums exactly.
- **Concentration**: HHI on revenue shares (0–10 000), top-1 and top-5 share.
- **Overhead allocation**: pool = GL opex + D&A in the period, allocated by net revenue / transactions / GPV (configurable); residual rounding assigned to the largest unit so allocations sum exactly.
- **Margin alert (ALERT v2)**: unit contribution (bps of GPV) in the month vs average of the previous 6 months; alert at ≥ 10 % decline (tenant setting); impact = Δ unit margin × current GPV.
