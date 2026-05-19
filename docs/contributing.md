# Contributing

How we work on the MIPS Booking & Payment Engine codebase.

## 1. Branch model

- `main` — always deployable. Protected; no direct pushes.
- `feature/<short-name>` — work in progress, one PR per branch.
- `fix/<short-name>` — bug fix.
- `release/v1.x.y` — release candidate, tagged after QA.
- `hotfix/<short-name>` — production patch, branched from the production tag.

Branch names are kebab-case, ≤ 50 chars, prefixed by intent.

## 2. Commits

- Imperative mood: *"Add booking concurrency test"*, not *"Added"*.
- Subject ≤ 72 chars; blank line; body wraps at 80 chars.
- One logical change per commit. `git rebase -i` is welcome before opening a PR.
- Reference issues: `Closes #123` in the body.

Bad:
```
fixed stuff
```
Good:
```
Hold ledger debit + booking flip in a single transaction

Previously the debit could land before the booking row was updated,
allowing a webhook replay to re-debit. Wrap both writes in the same
transaction and add a regression test.
```

## 3. Pull requests

- One PR = one reviewable unit. If you're touching two unrelated areas, open two PRs.
- Draft PRs are encouraged early. Mark *Ready for review* only when CI is green.
- Description follows the template in `.github/pull_request_template.md` (once created): summary, screenshots if UI, test plan.
- Required: 1 approval from a code-owner of the touched module.
- Required: green CI (tests, lint, typecheck).

## 4. Code style

### PHP
- PSR-12 + strict types: `declare(strict_types=1);` at every file top.
- 4-space indent, LF line endings.
- One class per file; namespace matches directory.
- Type hints on every parameter and return. `mixed` is a code smell; justify in review.
- No `static::` calls to non-static methods.
- Linter: `vendor/bin/phpcs --standard=PSR12 src/`.
- Static analysis: `vendor/bin/phpstan analyse --level=8`.

### JavaScript / TypeScript (PWA)
- TypeScript strict mode. No `any`.
- ESLint config: `@typescript-eslint/recommended-strict`.
- Prettier with 2-space indent, single quotes.
- Functional components, hooks. No class components.
- Server state: react-query; client state: zustand (minimal use).

### SQL
- One statement per file in `sql/migrations/`.
- Uppercase keywords, lowercase identifiers, snake_case columns.
- Every new table: PK, `created_at`, indexes documented in the migration's leading comment.

## 5. Tests

- **PHPUnit** for backend. Tests live in `tests/Unit/` and `tests/Integration/`.
- **Vitest + Playwright** for the PWA.
- Coverage target: 80% lines on `src/Booking`, `src/Payment`, `src/Ledger`. Other modules best-effort.
- Required tests for any PR touching `src/Booking/*` or `src/Payment/*`:
  - The concurrency test from `booking-engine.md` §8.
  - Webhook idempotency test (deliver the same event twice, assert single state change).

Run locally:
```bash
vendor/bin/phpunit
cd web && npm test
```

## 6. CI

Every PR triggers:

1. `composer install`
2. `phpcs` + `phpstan`
3. `phpunit`
4. PWA: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`
5. SQL migration smoke (apply all migrations to a throwaway DB)

Failing CI blocks merge. The only override is a code-owner approval **and** a written justification in the PR description (used in emergencies only).

## 7. Reviewing

- Read the description first; if it's missing or unclear, ask before reading the diff.
- One pass on architecture / approach; one pass on details (naming, edge cases, tests).
- Be concrete: link to the line, suggest the alternative.
- Approve once you'd be comfortable being paged for this code at 3am.

## 8. Adding a dependency

- Composer / npm — check license (must be permissive: MIT, BSD, Apache-2).
- Add a note to the PR: *why this dep, what alternatives considered*.
- Pin to a specific version range. Renovate / Dependabot configured to PR upgrades.

## 9. Architecture decisions

Significant decisions go in `docs/decisions/NNNN-title.md` using the [Nygard ADR](https://github.com/joelparkerhenderson/architecture-decision-record) format:

```
# Title
## Status (Proposed / Accepted / Deprecated / Superseded by XXXX)
## Context
## Decision
## Consequences
```

Examples already in repo:
- `0001-uniform-package-credit-model.md`

## 10. Release process

1. Cut `release/v1.x.y` from `main`.
2. Run full regression on staging.
3. Tag `v1.x.y`.
4. Deploy to production via runbook in `operations.md`.
5. Update `CHANGELOG.md`.
6. Announce to pilot studio.

## 11. Reporting issues

Use GitHub issues. Template:

```
**What I expected**
**What happened**
**How to reproduce**
**Environment** (browser, OS, studio handle, customer phone if relevant)
**Logs / screenshots**
```

Sev-1 (data loss, money loss, security): also page the on-call.

## 12. Code of conduct

Be direct, be kind, attack the problem not the person. Ship what you'd be proud to put your name on.
