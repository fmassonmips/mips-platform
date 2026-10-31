# Known limitations & technical debt register

Honest status of this release. Items marked **Risk** should be resolved before production use with real data.

| # | Area | Limitation | Impact | Risk | Plan |
|---|---|---|---|---|---|
| 1 | Auth | Supabase Auth was not used (no Supabase project/credentials available). Authentication is a self-hosted adapter (bcrypt + hashed sessions + TOTP) on the same PostgreSQL. | Migration to Supabase Auth would need an adapter for `getAuth()` | Low | Adapter swap if Supabase is adopted |
| 2 | Auth | `mfa_required_roles` is stored but MFA enrolment is not forced at login for those roles. | Admins can operate without MFA | **Risk** | Roadmap #2 |
| 3 | Auth | `users` table is global (not RLS-isolated); application code reads users only via tenant memberships. | A code defect could expose names/emails of other tenants' users | **Risk** | RLS on users + SECURITY DEFINER auth lookups |
| 4 | Secrets | TOTP secrets stored in the DB without application-level encryption | Relies on DB encryption at rest | Medium | KMS envelope encryption |
| 5 | API | No UI to issue API keys; rate limiting is in-memory per instance | Machine access requires admin script; limits not shared across instances | Medium | Roadmap #1 |
| 6 | Performance | 12-month fact loading on 1M transactions ≈ 7.7 s; controls ≈ 10.6 s (perf test budget met, but slow) | Slow first load for annual views; runs are cached by fingerprint afterwards | Medium | Daily summary table, roadmap #3 |
| 7 | Jobs | Imports and calculation runs execute synchronously inside the request/transaction | Very large imports (>200k rows) are rejected; long requests | Medium | Job queue |
| 8 | Data | Direct processing cost per transaction is a documented model (`processing_cost_rates`), so contribution KPIs are ESTIMATED | By design until processing invoices are reconciled | Low | Allocation of actual invoices |
| 9 | Data | `principal_gross` policy changes recognised revenue in the engine but demo GL is booked net; switching policy makes C07 fail until GL is re-mapped | Expected behaviour — flagged as DISPUTED | Low | Policy-change workflow |
| 10 | Integrations | Odoo / QuickBooks / bank APIs are registry entries only (file exports work) | Manual file transfer | Low | Roadmap #5 |
| 11 | Imports | Decimal parsing expects `.` decimal separator; `1.234,56` formats are rejected (not misread) | Some EU exports need conversion | Low | Locale option on mapping |
| 12 | Imports | No automatic PAN detection in uploaded files | Operational rule: files must not contain card data | **Risk** | Roadmap #6 |
| 13 | AI | Without `ANTHROPIC_API_KEY` the analyst is deterministic rules; with a key, the Claude path is implemented but was not exercised in this environment (no key) | Narrative quality limited to rules | Low | Test with a key |
| 14 | Reporting | PDF is server-generated (pdfkit, tables/text only, no charts); presentation export is print-to-PDF from the 16:9 view, not .pptx | Charts appear in the web view only | Low | Chart rendering in PDF |
| 15 | Treasury | Settlement-file reconciliation (acquirer vs merchant net settlement) not implemented; settlements table exists | Bank ↔ ledger reconciliation only | Medium | Roadmap #8 |
| 16 | Demo | All demo figures are synthetic; Bank of Mauritius capital requirement and 15 % tax rate are placeholders marked "verify" | Must not be used as actual MIPS figures | — | Replace with verified data |
| 17 | Multi-tenant | Feature flags are stored but navigation is gated by permissions only | All modules visible to permitted users | Low | Roadmap #7 |
| 18 | Ops | Error monitoring is a webhook sink, not a Sentry/OTel integration | Basic alerting only | Low | Later |
