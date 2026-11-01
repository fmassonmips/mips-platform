# Architecture

```
Browser ──HTTPS──► Next.js 15 (App Router, React 19, server components & server actions)
                     │  src/app/(app)/*      pages (21 modules)      src/app/api/v1/*  REST API
                     │  src/lib/auth         sessions, TOTP MFA, RBAC
                     │  src/lib/services     data access per module (tenant-bound transactions)
                     │  src/lib/engine       PURE decimal calculation engine (unit-tested)
                     │  src/lib/import       parsing, schema detection, validation
                     │  src/lib/ai           grounded analyst (rules or Claude)
                     ▼
               PostgreSQL 16 — single source of truth
                 RLS on every tenant table (FORCE on data tables), immutable evidence triggers,
                 hash-chained audit log, period & budget locks, SoD CHECK constraints
```

## Principles
- **Single source of truth**: every displayed figure is read from PostgreSQL or computed by `src/lib/engine` from it. No KPI is hard-coded.
- **Server-side financial calculation**: all money arithmetic is in server code with Decimal.js; the browser receives decimal strings and converts to numbers only for chart plotting.
- **Persisted, reproducible KPIs**: `runCalculation` stores every KPI value with its inputs, input hash, formula version and confidence. `ensureRun` re-uses a run only when the input fingerprint of the period is unchanged; otherwise a new immutable run is created.
- **Evidence never changes silently**: transactions, GL entries, source files/rows, KPI results, formula versions, reports, verifications and audit events are protected by triggers. Corrections are new records.
- **Tenant isolation in depth**: (1) PostgreSQL RLS keyed on `app.tenant_id`, set per transaction by `withTenant`; (2) the runtime role `mips_app` has `NOBYPASSRLS`; (3) `FORCE ROW LEVEL SECURITY` on data tables so even the owner role used by scripts is isolated; (4) every composite FK includes `tenant_id`; (5) file storage (`source_files`) is a tenant table.

## Data model (main groups)
| Area | Tables |
|---|---|
| Tenancy & identity | tenants, users, roles, permissions, role_permissions, memberships, sessions, login_attempts, api_keys, audit_events |
| Reference | currencies, exchange_rates, acquirers, payment_methods, products, verticals, merchant_groups, merchants, departments, chart_of_accounts |
| Payments | pricing_agreements (effective-dated), fee_schedules (effective-dated), processing_cost_rates, transactions, settlements |
| Accounting | financial_periods, gl_entries, adjustments, budget_versions, budget_lines, variance_commentary |
| Receivables / payables | customer_invoices, collection_events, collection_policies, suppliers, supplier_invoices |
| Treasury | bank_accounts (operating / restricted / safeguarded / merchant_settlement), bank_transactions, cash_ledger_items, reconciliations, recon_matches, recon_match_items, recon_exceptions, cash_forecast_items, regulatory_requirements |
| Imports | import_batches, source_files, import_source_rows |
| KPI & proof | kpi_definitions, formula_versions, calc_runs, kpi_results, kpi_verifications, evidence_records |
| Decisions & strategy | scenarios, executive_decisions, strategic_objectives, key_results, initiatives, initiative_updates, action_items |
| Reporting & AI | reports, ai_analyst_log |
| Operations | onboarding_cases, support_incidents, platform_uptime |

Schema: `db/migrations/*.sql` (numbered = applied once with checksum; `9xx` = repeatable security layer).

## Request lifecycle
1. `src/middleware.ts` — cookie gate for pages; token-bucket rate limit for `/api/*`.
2. `requireAuth(permission)` / `apiAuth(req, permission)` — validates the hashed session token (idle 30 min, absolute 12 h), MFA state, membership, role permissions.
3. `withTenant({tenantId, userId}, fn)` — `BEGIN; set_config('app.tenant_id', …, true)`; all queries in `fn` are RLS-scoped; commit/rollback.
4. Mutations write an audit event in the same transaction.

## Calculation engine modules (`src/lib/engine`)
`fees` (effective-dated pricing / fee resolution) · `economics` (GPV vs revenue, policy-dependent recognition, allocation) · `kpis` (registry + compute) · `pricing` (bps simulation) · `breakeven` · `runway` (+ stress) · `cashforecast` (13-week) · `reconcile` (1:1, 1:n, n:1) · `bridge` (revenue bridge, concentration) · `aging` · `scenarios` (13 templates).
