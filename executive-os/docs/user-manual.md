# User manual

MIPS Executive OS answers seven questions: what is happening, why, which customers/products/partners create value, where money or risk is leaking, what a decision would do, whether every number can be verified, and whether decisions delivered. The DEMO tenant banner means every figure is synthetic.

## Common controls
- **Period selector** (top right of each page): month, quarter, calendar year, fiscal year (FY = July–June by default), YTD / FYTD or a custom range; comparison vs prior period or same period last year.
- **Confidence badges**: VERIFIED · PENDING · DISPUTED · ESTIMATED (hover for the reason). VERIFIED is a management classification, not an audit opinion.
- **Source & proof →** on every KPI card opens the Financial Proof Center for that KPI and period.
- **Tables**: click headers to sort, filter rows, export CSV; links drill down.

## Modules
| Module | What you do there |
|---|---|
| Executive Overview | 30+ KPIs (financial, payments, operations) with trend, comparison, status and source; margin and data-control alerts; GPV vs revenue chart |
| Financial Performance, Revenue Intelligence, Operating Costs, Budget & Forecast, Profit & Loss | GL-based performance, revenue bridge (volume vs price vs mix vs new/lost merchants), concentration, cost categories & anomalies, budget versions/approval/commentary, P&L with drill-down to journal lines and Excel export |
| Cash Flow, Treasury Forecast, Accounts Receivable, Supplier Payments, Liquidity & Runway | bank reconciliation (auto/manual matching, exceptions, approval), 13-week forecast (3 scenarios, collection-delay sensitivity), AR aging/DSO/collections workflow (reminders need a second approver; nothing is sent automatically), supplier planner (approval, schedule; no payment is ever initiated), runway and stress tests |
| Merchant Intelligence, Product Profitability, Break-Even | merchant economics by any dimension, segmentation matrix, pricing simulation (−5/−10/−20/−30 bps and custom; **1 bp = 0.01 percentage point**), transaction drill-down with the exact agreement and fee schedule applied, product profitability with transparent allocation, accounting and cash break-even |
| Formula Audit | registry of every KPI formula with version hash; 11 automated controls per calculation run; run controls on demand |
| Financial Proof Center | 8-step proof per KPI (definition → formula → source → supporting records → reconciliation → adjustments → approvals → evidence package); re-perform merchant fee calculations against contracts |
| CEO Decision Center | 13 scenario templates; base / proposed / downside; compare scenarios side by side; record a decision with evidence, owner, approver and deadline; approval by a second person; outcome measured against the approved expectation |
| Strategy Execution & War Room | objectives, key results measured from KPIs, initiatives with owner/target/deadline/status/blockers/next action/impact/dependencies, action register, weekly War Room |
| Reports & Board Pack | generate frozen reports (monthly, quarterly Board, annual, budget, merchant, liquidity, strategy, risk, CEO briefing, decision outcome) → PDF / Excel / presentation; AI analyst Q&A |
| Data Integrations | upload CSV/XLSX → map → validate → preview → approve (second person) → commit → reconcile |

## Walk-through: from a margin alert to a Board report
1. Executive Overview (Sep/Oct 2026) shows *Contribution margin decline — Lagoon Resorts Group*. Click **Investigate**.
2. The merchant page shows the international wholesale rate moving from 160 to 195 bps (SBM schedule `SBM-FS-2026-09-INTL`) and the transactions it applied to.
3. Click **Create scenario in CEO Decision Center**; create alternatives (e.g. +25 bps pass-through, migrate 60 % of volume to MCB, +10 bps) in one comparison group, then **Compare**.
4. Proof Center → *re-perform fee calculation* for the merchant: expect “0 mismatches”.
5. On the chosen scenario, **Record decision** (owner, approver, deadline, evidence). A different user approves; an initiative and action appear in Strategy Execution.
6. Implement (e.g. new pricing agreement), import the next period’s transactions, then **Measure actual outcome**.
7. Reports → *Decision outcome report* → PDF for the Board.
