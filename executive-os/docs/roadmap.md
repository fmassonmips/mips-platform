# Product roadmap

Status legend: ✅ delivered in this release · 🔜 next · 🗓 later

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Shell, design system (light/dark), navigation, auth + TOTP MFA, RBAC, multi-tenant RLS, configuration, demo data | ✅ |
| 2 Data & proof | Imports (7 targets), source preservation, validation, KPI registry, calculation engine, formula audit, Proof Center | ✅ |
| 3 Financial management | Executive overview, financial performance, revenue, costs, budget vs actual, P&L, AR, suppliers | ✅ |
| 4 Treasury | Bank reconciliation, cash flow, 13-week forecast, liquidity & runway, stress tests | ✅ |
| 5 Merchant profitability | Merchant/acquirer/product economics, MDR analysis, pricing simulation, segmentation, break-even | ✅ |
| 6 Decision Center | Scenario engine, comparison, register, approval, action tracking, actual vs expected | ✅ |
| 7 Strategy & AI | Objectives, War Room, action tracker, grounded AI analyst, briefings, Board reporting | ✅ |
| 8 Hardening | Security review, automated tests (unit/integration/E2E/perf), backup validation, docs, Docker/CI | ✅ (see limitations) |

## Next (🔜)
1. API-key issuance UI and scoped keys; shared rate-limit store (Redis) for multi-instance deployments.
2. MFA enforcement for `mfa_required_roles` at login; KMS envelope encryption for TOTP secrets.
3. Pre-aggregated daily transaction summary table (refreshed on import) to bring 12-month fact loading under 1 s at 10M+ rows.
4. Background job queue for large imports and calculation runs (currently synchronous within the request).
5. Odoo and QuickBooks API connectors (file-export paths work today); scheduled MIPS gateway SFTP feed.
6. PAN/SAD detector on upload (reject files containing card numbers).
7. Feature-flag menu gating; tenant self-service provisioning; subscription billing.
8. Settlement reconciliation (acquirer settlement files vs expected net settlement per merchant).

## Later (🗓)
Bank API statement retrieval (MCB/SBM host-to-host), FX revaluation engine, consolidated multi-entity reporting, IFRS 15 principal/agent policy workflow with auditor sign-off, mobile-optimised War Room, Sentry/OpenTelemetry integration.
