# Security architecture

> This document describes controls implemented in the software. It is **not** a claim of PCI DSS, ISO 27001, SOC 2, GDPR or Mauritius DPA compliance; any such claim requires independent assessment.

## Identity & access
| Control | Implementation |
|---|---|
| Passwords | bcrypt (cost 12); policy ≥ 12 chars with upper/lower/digit (`src/lib/auth/password.ts`); constant-time path for unknown users |
| Sessions | 256-bit random token in HttpOnly SameSite=Lax cookie; only SHA-256 stored; idle timeout 30 min, absolute 12 h; revoked on logout |
| MFA | RFC 6238 TOTP (`src/lib/auth/totp.ts`), enrolment and verification flows; tenant setting `mfa_required_roles` (enforcement at login for those roles is on the roadmap — see limitations) |
| Brute force | `login_attempts`: 5 failures / email / 15 min, 30 / IP / 15 min |
| RBAC | 25 permissions × 7 system roles (`src/lib/auth/permissions.ts`), tenant-configurable roles; every server action and API route checks its permission server-side |
| Least privilege | runtime DB role `mips_app` (NOSUPERUSER, NOBYPASSRLS); owner role only for migrations/scripts; `mips_backup` read-only BYPASSRLS for dumps |
| Segregation of duties | DB CHECK constraints: supplier invoice submitter ≠ approver; budget submitter ≠ approver; reconciliation preparer ≠ approver; adjustment proposer ≠ approver; collection reminder creator ≠ approver; decision proposer ≠ approver (service + CHECK); import uploader ≠ approver (service) |

## Tenant isolation
RLS policy `tenant_id = app_tenant()` on every table with `tenant_id`; `FORCE ROW LEVEL SECURITY` on all data tables; pre-tenant lookups only through narrow SECURITY DEFINER functions (`auth_user_memberships`, `auth_api_key_lookup`). Background work (imports, calculation runs, seeding) runs inside the same tenant-bound transaction. File storage (`source_files`) is RLS-isolated. Explicit tests: `tests/integration/security.test.ts` (cross-tenant reads, writes, updates, file storage, role attributes).

## Integrity & audit
- Immutable records (triggers): transactions (financial fields), GL entries (append-only; locked periods reject postings), import source files and rows, KPI results, formula versions, verifications, evidence records, reports, audit events.
- Audit log: every mutation writes `audit_events` in the same transaction; SHA-256 hash chain per tenant (`prev_hash` → `hash`), verifiable in-app (Administration → Audit) and by `scripts/verify-restore.ts`.
- Demo purge is the only deletion path and only for `is_demo` tenants via `purge_demo_tenant_data()` (caller must be bound to that tenant). A NULL-logic defect in this guard was found by the integration suite and fixed in migration 006.

## Application security
- Input validation with zod on every action/API body; parameterised SQL only.
- CSRF: server actions (Next.js origin check) and API mutations require same-origin `Origin`.
- Security headers (`next.config.mjs`): CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- File uploads: size (20 MB) and row (200 000) limits, extension allow-list, parsed in memory, sanitised filenames, stored as bytes (never executed).
- API rate limiting (token bucket, middleware). *(In-memory per instance — use a shared store for multi-instance deployments.)*
- Logging: structured JSON; keys matching password/secret/token/cookie/authorization/mfa are redacted; errors optionally forwarded to `ERROR_WEBHOOK_URL`.
- AI: the analyst is read-only, sees only a fact sheet, and every numeric claim is validated against cited facts; API key only from environment.

## Payment data (PCI DSS scope minimisation)
The platform stores **no PAN, CVV/CVC, PIN, track data or other sensitive authentication data** — the schema has no such columns; transactions hold scheme, region, amounts and references only. Import mapping has no field for card numbers; unmapped columns remain only in the preserved raw row, so **source files must not contain PAN/SAD** (operational rule; a PAN detector on upload is on the roadmap).

## Encryption
- In transit: deploy behind TLS (HSTS header set; `COOKIE_SECURE=true`). Database connections should use `sslmode=require` in production.
- At rest: rely on encrypted storage / managed PostgreSQL encryption. TOTP secrets are stored in the database — application-level envelope encryption with a KMS is on the roadmap.
- Secrets: environment variables / secret manager only; `.env.local` is git-ignored.
