# Deployment instructions

## Prerequisites
Node.js 22, PostgreSQL 16 (pgcrypto), TLS-terminating reverse proxy or platform load balancer.

## 1. Database bootstrap (once, as superuser)
Edit passwords in `db/bootstrap.sql` (or create the roles with your secret manager), then `psql -f db/bootstrap.sql`.

## 2. Configuration (environment)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | runtime connection as `mips_app` (append `?sslmode=require` in production) |
| `DATABASE_OWNER_URL` | migrations / provisioning only — not given to the web process |
| `APP_SECRET` | 32+ random bytes |
| `COOKIE_SECURE=true` | behind HTTPS |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | optional AI provider (default model `claude-opus-5-5`); without it the deterministic analyst is used |
| `ERROR_WEBHOOK_URL` | optional error-event sink for monitoring |
| `API_RATE_PER_MIN`, `DB_POOL_MAX`, `LOG_LEVEL` | tuning |
| `SHOW_DEMO_HINT=false` | hide demo credentials hint on the login page in production |

## 3. Migrate
`npm ci && npm run db:migrate` (with `DATABASE_OWNER_URL`). Migrations are checksummed; the `9xx` security layer is re-applied each run.

## 4. Build & run
```bash
npm run build && npm start            # or
docker compose up --build             # db + migrate + app (set APP_SECRET)
```
The Docker `runtime` image runs as non-root with a health check on `/api/v1/health`.

## 5. Provision tenants
- Demo: `npm run db:seed` (idempotent) / `npm run db:reset-demo`.
- Production tenant: use `provisionTenant`, `upsertUser`, `addMembership` from `src/lib/services/provision.ts` in an owner-run script (a CLI wrapper is on the roadmap). Then sync the KPI registry (Administration → KPIs → Re-sync) and import reference data, pricing agreements, fee schedules, GL and transactions through Data Integrations.

## 6. CI/CD
`.github/workflows/executive-os.yml`: typecheck → unit tests → migrations → integration tests (tenant isolation, immutability, SoD, imports, decisions) → build → seed → end-to-end acceptance scenario.

## 7. Operations
Structured JSON logs to stdout; health endpoint; backups per `docs/backup-recovery.md`; period-end: import → reconcile → lock period (Administration) → verify KPIs (Proof Center) → generate Board pack.
