# API documentation (`/api/v1`)

Machine-readable spec: `GET /api/v1/openapi.json` (OpenAPI 3.1, source `src/lib/openapi.ts`).

## Authentication
- **Browser**: session cookie `mips_eos_session` (HttpOnly, SameSite=Lax; `Secure` when `COOKIE_SECURE=true`). Mutating requests must carry an `Origin` header matching `Host` (CSRF defence) — otherwise `403 csrf_origin_mismatch`.
- **Machine**: `Authorization: Bearer <api key>`. Keys are stored as SHA-256 hashes (`api_keys`); the key acts with the permissions of its user's role in its tenant. *(Key issuance UI is on the roadmap; keys can be inserted by an administrator script today — see limitations.)*
- Rate limit: token bucket per credential, `API_RATE_PER_MIN` (default 240) → `429` with `retry-after`.

## Conventions
- Responses: `{ "data": …, "meta": { "tenant": "<code>", "demo": true|false } }`. Errors: `{ "error": "<message>" }` with 400 / 401 / 403 / 404 / 409 (immutable record, locked period, segregation of duties) / 429 / 500 (`internal_error`, details only in server logs).
- Money and rates are **decimal strings**. Rates in bps unless the field says fraction.
- Period selection: `?range=m:2026-10 | q:2026-Q3 | y:2026 | fy:2027 | c:2026-01-01..2026-03-31 | ytd | fytd`.

## Endpoints
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /health` | none | DB connectivity probe |
| `GET /kpis?range=` | dashboard.view | All KPI results of the (re-used or new) calculation run |
| `GET /kpis/{code}?range=` | proof.view | Proof: definition, formula version/hash, sources, batches, controls, verifications, history |
| `GET /proof/kpi/{code}/package?range=[&format=xlsx]` | proof.export | Evidence package with per-section SHA-256 manifest (logged) |
| `GET /merchants/profitability?range=&groupBy=&allocation=` | merchant.view | Economics by merchant / group / vertical / segment / acquirer / method / scheme / region / currencies / product / month |
| `GET /merchants/{id}/transactions?range=&limit=&offset=&region=&acquirer=&status=` | merchant.view | Transaction drill-down incl. applied pricing agreement and fee schedule |
| `GET|POST /merchants/{id}/pricing-agreements` | merchant.view / merchant.pricing | List / create effective-dated agreement (previous open one is closed the day before) |
| `GET|POST /scenarios` · `GET /scenarios/{id}` | dashboard.view / scenario.manage | Templates & scenarios; run a scenario `{name, template, assumptions, comparison_group?}` |
| `GET|POST /decisions` · `GET /decisions/{id}/detail` | dashboard.view / decision.propose | Decision register |
| `POST /decisions/{id}/{approve|reject}` | decision.approve | Approver ≠ proposer (409 otherwise) |
| `POST /decisions/{id}/{in_progress|implemented|closed|cancelled}` | decision.propose | Status transitions |
| `POST /decisions/{id}/measure` | dashboard.view | Measure actual vs expected and persist |
| `GET|POST /imports` (multipart `file`, `kind?`) | data.import | Upload → detect → map → validate |
| `GET /imports/{id}/status` · `POST /imports/{id}/validate` | data.import | |
| `POST /imports/{id}/{approve|reject|commit}` | data.approve_import | Approver ≠ uploader; commit is transactional and reconciled |
| `GET /imports/{id}/file` · `GET /imports/{id}/errors` · `GET /imports/templates/{kind}` | data.import | Original file, error CSV, template CSV |
| `GET|POST /reports?range=` | dashboard.view / report.generate | List / generate & freeze `{kind, decision_id?}` |
| `GET /reports/{id}/export?format=pdf|xlsx|json` | dashboard.view | Render frozen content |
| `POST /analyst?range=` `{question}` | ai.use | Grounded analyst answer with classified statements and rejected statements |

## Example
```bash
curl -s -b cookie.txt 'http://localhost:3000/api/v1/merchants/profitability?groupBy=acquirer&range=q:2026-Q3' | jq '.data.rows[] | {key, netRevenue, takeRateBps}'
```
