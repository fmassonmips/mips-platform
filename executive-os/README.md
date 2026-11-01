# MIPS Executive OS

Financial intelligence, payment economics and CEO decision platform — first tenant MIPSIT Digital Ltd (Mauritius).
Multi-tenant SaaS: Next.js 15 · React 19 · TypeScript · Tailwind · Recharts · TanStack Table · PostgreSQL 16 (RLS) · Decimal.js.

> **DEMO data**: the bundled dataset is synthetic (tenant `mips-demo`, every name suffixed "(DEMO)"). It must never be presented as actual MIPS results.

## Quick start (local)
```bash
cd executive-os
npm ci
psql -U postgres -f db/bootstrap.sql            # roles mips_owner / mips_app / mips_backup + databases
cp .env.example .env.local                      # adjust credentials
npm run db:migrate && npm run db:seed           # ≈45 s: 18 months, ~285k transactions, GL, bank, AR/AP, budgets
npm run dev                                     # http://localhost:3000
```
Demo logins (password `Demo-Passw0rd-2026`): `ceo@`, `cfo@`, `finance@`, `analyst@`, `auditor@`, `admin@`, `viewer@`, `chair@mips.demo` (Board Chair — approves decisions); `cfo@acme.demo` (second tenant). `admin@mips.demo` can switch tenants.

## Tests
| Command | What it covers |
|---|---|
| `npm test` | unit tests: money, fees, economics, pricing (bps), break-even, runway, 13-week forecast, reconciliation, revenue bridge, aging, finance, treasury, merchants, strategy |
| `npm run test:integration` | against `mips_eos_test`: tenant isolation (RLS), immutability, audit chain, period/budget locks, SoD, import pipeline, reproducibility, fee re-computation, decision → report |
| `npm run test:e2e` | §36 acceptance scenario through the UI (server at `BASE_URL`, freshly seeded DB) |
| `npm run test:perf` | 1M-transaction load and timing budgets |

## Documentation (`docs/`)
architecture · api · financial-formula-dictionary (generated) · user-manual · administrator-manual · deployment · security-architecture · backup-recovery · tenant-configuration · roadmap · known-limitations · phase-reports · dev/module-conventions

## Layout
```
db/migrations        schema, RLS, triggers (numbered + repeatable 9xx)
scripts/             migrate, seed-demo, backup/restore/verify, formula dictionary
src/lib/engine       pure decimal calculation engine (unit-tested)
src/lib/services     tenant-scoped data services per module
src/app/(app)        21 modules            src/app/api/v1   REST API (+ /openapi.json)
tests/               unit · integration · e2e · perf
```
The legacy PHP login prototype at the repository root is untouched and not used by Executive OS.
