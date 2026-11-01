# Administrator manual

## Users & roles (Administration → Users / Roles)
- System roles: `admin`, `ceo`, `cfo`, `finance_manager`, `analyst`, `auditor`, `board_chair`, `viewer` (permission matrix in `src/lib/auth/permissions.ts`). Custom roles are cloned from a system role.
- Creating a user generates a one-time password shown once; users change it in **Account** and can enrol TOTP MFA there.
- Segregation of duties is enforced by the database regardless of role (see security architecture). Give approvers and preparers different accounts.

## Tenant settings (Administration → Settings)
`revenue_recognition` (`agent_net` | `principal_gross`, with mandatory policy note — changes are audited and trigger new calculation runs), `overhead_allocation`, `minimum_liquidity`, `materiality_pct`, `margin_alert_threshold_pct`, `revenue_recon_tolerance`, fiscal-year start month, feature flags.

## Reference data
Acquirers, payment methods, products, verticals, merchant groups, departments and chart of accounts are data, not code (MCB, SBM, MauCAS, Juice, blink, my.t money etc. are DEMO rows). Codes become immutable once referenced.

## Period close
1. Import GL, bank and transaction files (Data Integrations; approver ≠ uploader).
2. Reconcile bank accounts (Cash Flow) — exceptions are investigated and resolved, never written off automatically.
3. Review Formula Audit controls for the period; resolve failures (e.g. post an approved adjustment).
4. Lock the period (Administration → Periods, `finance.lock_period`). Locked periods reject postings; unlocking needs a reason and is audited.
5. Record KPI verifications in the Proof Center; generate the Board pack.

## Audit & integrity
Administration → Audit: filter events, **Verify audit chain** (recomputes every hash). Evidence exports and report generations are logged with SHA-256.

## KPI registry
Formulas live in code (`src/lib/engine/kpis.ts`); deploying a changed formula creates a new formula version on **Re-sync registry** and control C06 flags any mismatch until synced. Regenerate the dictionary with `npm run docs:formulas`.

## Demo tenant
Administration → Demo: reset regenerates the synthetic dataset (≈45 s). Only tenants flagged `is_demo` can be reset; the database refuses otherwise. CLI: `npm run db:reset-demo`.

## Backups
See `docs/backup-recovery.md`.
