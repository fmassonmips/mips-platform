# Module development conventions (MIPS Executive OS)

Read this before adding a module. The foundation is in place; modules plug into it.

## Stack & layout
- Next.js 15 App Router + React 19 + TypeScript + Tailwind 3 (`executive-os/`). Pages live in `src/app/(app)/<route>/page.tsx` (server components, `export const dynamic = 'force-dynamic'`).
- PostgreSQL schema: `db/migrations/*.sql` (read 002–004 for the tables). Runtime role `mips_app` is subject to Row Level Security: every tenant table is filtered by `app_tenant()`.
- Demo data: `src/lib/demo/seed.ts` (read its header for the embedded storylines). Demo login: `ceo@mips.demo`, `cfo@mips.demo`, `finance@mips.demo`, `analyst@mips.demo`, `auditor@mips.demo`, `admin@mips.demo`, `viewer@mips.demo` — password `Demo-Passw0rd-2026`.

## Data access (mandatory patterns)
- Page context: `const { auth, period, sp, months, fyears } = await pageContext(searchParams, '<permission>')` from `@/lib/page`. Then `await tx(auth, async (t) => { ... })` runs queries in a tenant-bound transaction. Never query without it.
- Helpers: `q(t, sql, params)` / `one(t, sql, params)` from `@/lib/db`. Always parameterised SQL. Cast numerics to text (`::text`) — never let money become a JS number.
- Money: ONLY `@/lib/money` (`dec`, `sum`, `safeDiv`, `applyBps`, …, Decimal.js). No `Number()`/`parseFloat` arithmetic on money. Converting to number is allowed only for chart plotting (the chart components do it).
- Engines (pure, tested) in `src/lib/engine/*`: fees, economics (`economics`, `allocate`), pricing, breakeven, runway (+ `STANDARD_STRESS_TESTS`, `projectCash`), cashforecast (`forecast13w`, `collectionDelaySensitivity`, `DEFAULT_SCENARIOS`), reconcile, bridge (`revenueBridge`, `concentration`), aging, kpis, scenarios. Reuse them; don’t re-implement formulas in pages.
- Existing services: `src/lib/services/facts.ts` (`loadPeriodFacts`, `tenantInfo`, `SAAS_CTE`), `kpi.ts` (`kpiDashboard`, `monthlySeries`, `ensureRun`), `checks.ts`, `merchants.ts` (`economicsBy`, `merchantMonthly`, `marginAlerts`, `merchantTransactions`, …).
- Mutations: server actions (`'use server'`) in an `actions.ts` next to the page. Each action: `const auth = await requireAuth('<perm>')` (from `@/lib/auth/session`), validate input with zod, run in `withTenant(tctx(auth), ...)`, write an audit event with `audit(t, { tenantId, userId, action, entityType, entityId, payload })` from `@/lib/audit`, then `revalidatePath(...)`/`redirect(...)`.
- Segregation of duties is ALSO enforced by DB CHECK constraints (submitter ≠ approver, preparer ≠ approver). Surface those errors to the user as readable messages; do not bypass.
- Never modify financial evidence silently: GL entries, transactions, KPI results, source rows, audit events are immutable by trigger. Corrections = new records (adjustments, reversals, new versions).

## UI kit (reuse, do not fork)
- `@/components/ui/card` (`Card`, `CardHeader`, `CardBody`), `page-header` (`PageHeader`, `Section`, `EmptyState`, `Callout`), `badge` (`Badge`, `StatusBadge`, `ConfidenceBadge`, `DemoBadge`), `kpi-card` (`KpiCard`), `charts` (`TrendChart`, `Sparkline`, `HBarChart`, `Waterfall` — client components taking decimal strings), `data-table` (`DataTable` with sort/filter/CSV export/drill-down links via `href: '/x/{id}'` on a column or `rowHref`), `period-filter` (`PeriodFilter` bound to `?range=`).
- Formatting: `@/lib/format` (`fmtMoney`, `fmtPct` (fraction→%), `fmtBps`, `fmtNumber`, `fmtValue`, `monthLabel`, `fmtDate`). Dates: `@/lib/dates`. Periods: `@/lib/period` (`parsePeriod`, `trailingMonths`).
- Styling tokens: `bg-surface`, `bg-surface-2`, `border-border`, `text-muted`, `text-fg`, `bg-navy`, `text-gold`, `text-pos`, `text-neg`, `text-warn`, `text-info`; classes `.card .btn .btn-primary .btn-gold .btn-danger .input .label .th .td .link`. Light & dark themes come from tokens — never hard-code colours except in charts.
- Every number shown must come from the database/engine. No hard-coded KPIs, no decorative controls that do nothing. Every dashboard: filters (period at least), drill-down links, export (DataTable CSV at minimum), and a provenance line (source tables/formula, link to `/proof/kpi/<CODE>` when the figure is a registered KPI).
- Synthetic data: the shell already shows the DEMO banner. Don’t claim certification/compliance anywhere.

## Working rules for parallel contributors
- Only create/modify files inside the scope you were given. Shared files (`src/components/**`, `src/lib/engine/**`, `src/lib/services/{facts,kpi,checks}.ts`, layouts, nav, migrations) are read-only for you; if you need a change, add a NEW file in your scope or describe the needed change in your final report.
- A dev server is already running at http://localhost:3000 — do not start another one and do not run `next build`. Get a session cookie with `executive-os/scripts/dev-login.sh <email>` (prints a cookie-jar path), then `curl -s -b <jar> http://localhost:3000/<route>` and check for HTTP 200 and expected content; the dev log is not available to you, so look for Next.js error markers (`__next_error__`, `Application error`) in the HTML.
- Type-check with `cd executive-os && npx tsc --noEmit --incremental false`. Unit tests for any new pure logic go in `tests/unit/<module>.test.ts` (vitest: `npx vitest run tests/unit/<file>`).
- Do not run git commands that change state (no commit/checkout/stash/reset). The lead integrates and commits.
- Do not run migrations or reseed the database.
