# Phase reports

All results below were produced by commands actually run on 2026-10-31 (local PostgreSQL 16, Node 22).

| Phase | Implemented | Verification |
|---|---|---|
| 1 Foundation | Next.js shell, design system (navy/charcoal/gold, light/dark), 21-module navigation, session auth + TOTP MFA (forced for `mfa_required_roles`), 25 permissions × 7 roles, multi-tenant RLS, tenant settings, deterministic DEMO generator | Integration: cross-tenant read/write/update/file isolation, runtime role has no BYPASSRLS |
| 2 Data & proof | Import framework (7 targets), immutable source files/rows, KPI registry (33 KPIs + dimensions), persisted calculation runs with fingerprints, 11 controls, Formula Audit, Proof Center (8-step proof, reproducibility, fee re-computation, evidence package) | Integration: import validate→SoD→commit→reconcile→trace to source file; idempotent re-upload; KPI reproducibility; Aug-2026 C07 DISPUTED storyline |
| 3 Financial management | Executive overview, financial performance, revenue (bridge, concentration), costs (anomalies), budget engine (versions, approval, lock, commentary), P&L with GL drill-down + XLSX, AR, suppliers | Unit (finance 23 tests); route sweeps; budget workflow incl. DB-enforced SoD |
| 4 Treasury | Bank reconciliation (1:1, 1:n, n:1, exceptions, no write-off, SoD approval), cash flow, 13-week forecast (3 scenarios, sensitivity), liquidity & runway, 6 stress tests | Unit (reconcile, forecast, runway, treasury 14 tests); MCB-OPS Oct-2026 workflow: 28 proposals, 4 expected exceptions |
| 5 Merchant profitability | Economics by 12 dimensions, overhead allocation, segmentation matrix, pricing ladder & custom simulation (bps), transaction drill-down with applied contracts, effective-dated agreements, product profitability, break-even | Unit (pricing/break-even, merchants 15 tests); Lagoon storyline (SBM 160→195 bps from Sep-2026) |
| 6 Decision Center | 13 scenario templates, comparison, decision register, SoD approval, initiative/action creation, status workflow, actual-vs-expected measurement (with partial-month run-rate) | Integration: scenario→decision→approval→initiative→outcome→report |
| 7 Strategy & AI | Objectives, KPI-measured key results, initiatives with dependencies, action register, War Room, grounded AI analyst (classified statements, numeric grounding validator), CEO briefing, Board Reporting Center (frozen, SHA-256; PDF/XLSX/presentation) | Unit (strategy 22, admin 10); report export PDF/XLSX verified |
| 8 Hardening | Security review (two defects found and fixed: NULL purge guard; owner-role RLS bypass → FORCE RLS), performance test, backup/restore validation, docs, Docker, CI, production build | See below |

## Test results (final run)
- `npm test` — **116/116** unit tests, 10 files.
- `npm run test:integration` — **24/24** (tenant isolation, immutability, audit chain, period/budget locks, SoD, imports, reproducibility, fee re-computation, decision lifecycle).
- `npm run test:e2e` — **12/12** steps of the §36 acceptance scenario on a production build (`next start`) against a freshly seeded database.
- `npm run test:perf` — 1,017,011 transactions: all budgets met (12-month facts 7.7 s, merchant economics 12 months 1.5 s, controls 10.6 s, monthly calculation run 0.9 s).
- `npm run build` — production build succeeds; `tsc --noEmit` clean.
- Backup → restore → verify cycle: `RESTORE VERIFIED` (0 audit-chain breaks, 0 unbalanced journals).

## Acceptance scenario evidence (E2E run)
Decision `DEC-2026-002` "A — Pass through +25 bps" for Lagoon Resorts Group (DEMO): baseline monthly contribution MUR 324,875.30, expected MUR 338,886.71; November 2026 (partial, 1–14 Nov, 400 synthetic imported transactions) actual MUR 133,166.16, run-rate MUR 285,356.06 → below expectation, flagged for re-measurement after month end. Board report frozen with SHA-256 and exported to PDF.

## Remaining limitations
See `known-limitations.md` (notably: users table not RLS-isolated; no PAN detector on upload; synchronous imports/calculations; 12-month fact loading performance).
