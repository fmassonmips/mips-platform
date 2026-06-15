# PassPass Platform — API Specification

REST over HTTPS. JSON request/response. All responses go through
`App\Response::json`. State-changing browser requests require the
`X-CSRF-Token` header (synchronizer token); server-to-server merchant API
clients authenticate with an API key instead (see §Auth).

> **Implemented today:** the `Auth` module (`/api/auth/*`). All other modules
> below are the **specification** the schema, RBAC, providers, and routing engine
> are built to support, to be wired up in the next phases (see
> `ARCHITECTURE.md` §9).

## Conventions

- Base path: `/api`
- Money: integer **minor units** + ISO-4217 `currency` (e.g. `{ "amount_minor": 150050, "currency": "MUR" }`).
- IDs in URLs are opaque references (`TXN_...`, `MER_...`).
- Errors: `{ "error": "message", ... }` with HTTP status `4xx/5xx`.
- Idempotency: send `Idempotency-Key` header on payment creation.

## Auth (implemented)

| Method | Path | Body | Success |
|--------|------|------|---------|
| POST | `/api/auth/register` | `{email,name,password}` | `201 {success, message}` (account inactive until admin activation) |
| POST | `/api/auth/login` | `{email,password}` | `200 {user}` + session cookie |
| POST | `/api/auth/logout` | — | `200 {success}` |
| GET  | `/api/auth/me` | — | `200 {user}` / `401` |

Errors: `405` method, `419` CSRF, `422` validation, `429` rate-limited, `401` auth.

## Merchant API — HMAC request signing (implemented)

Machine-to-machine endpoints under `/api/v1/*` authenticate with a signed
request (no session/CSRF). Keys are issued from the merchant portal / the
session endpoints below; the **secret is shown once**.

Signing:

```
signing_string = "<unix_ts>\n<METHOD>\n<request_target>\n<raw_body>"
X-Api-Key:   <key_id>            # pk_...
X-Timestamp: <unix_ts>           # within API_SIGNATURE_TTL (default 300s)
X-Signature: hex( HMAC-SHA256(signing_string, secret) )
```

The secret is stored encrypted at rest (AES-256-GCM, `App\Support\Crypto`) so
the server can recompute the HMAC; only `sha256(secret)` and the ciphertext are
persisted — never the plaintext.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/apikeys/create` | session + `apikey.self.manage` | returns the secret once |
| GET  | `/api/apikeys/list` | session + `apikey.self.manage` | never returns secrets |
| POST | `/api/apikeys/revoke` | session + `apikey.self.manage` | `{key_id}` |
| POST | `/api/v1/links/create` | **HMAC** | create a payment link as the merchant |
| GET  | `/api/v1/transactions/show?ref=TXN_…` | **HMAC** | merchant-scoped transaction |

Failures: `401` (bad/absent/expired signature), `403` (merchant not cleared).

## Merchants & onboarding (spec)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| POST | `/api/merchants` | `merchant.self.update` | Create merchant → `PassPassProvider::createMerchant` (issues `regulated_merchant_id`) |
| GET  | `/api/merchants/{ref}` | `merchant.self.read` / `merchant.read.all` | |
| PATCH | `/api/merchants/{ref}` | `merchant.self.update` | |
| POST | `/api/merchants/{ref}/bank-accounts` | `merchant.bank.manage` | masked account only |

## KYC & compliance (spec)

| Method | Path | Permission |
|--------|------|-----------|
| POST | `/api/kyc/{merchantRef}/submit` | `merchant.kyc.submit` |
| GET  | `/api/kyc/{merchantRef}` | `kyc.read.all` |
| POST | `/api/compliance/{merchantRef}/decision` | `kyc.decide` (PassPass) |
| POST | `/api/compliance/{merchantRef}/risk` | `compliance.risk.score` |
| POST | `/api/compliance/{merchantRef}/suspend` | `merchant.suspend` |

## Payments (spec)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| POST | `/api/payments` | `payment.initiate` | `{payment_type, amount_minor, currency, merchant_reference}` → routed via `PaymentRouter` |
| GET  | `/api/payments/{txnRef}` | `payment.self.read` / `transaction.read.all` | |
| POST | `/api/payments/{txnRef}/refund` | `transaction.read.all` | `PassPassProvider::refundPayment` |
| POST | `/api/payments/{txnRef}/cancel` | `payment.initiate` | |

## Payment links / QR / requests (spec)

| Method | Path | Permission |
|--------|------|-----------|
| POST/GET | `/api/links` , `/api/links/{ref}` | `paymentlink.manage` |
| POST/GET | `/api/qr` , `/api/qr/{ref}` | `qr.manage` |
| POST/GET | `/api/payment-requests` | `paymentrequest.manage` |

## Virtual credentials & aliases (spec)

| Method | Path | Permission |
|--------|------|-----------|
| POST/GET | `/api/credentials` | `credential.self.manage` |
| POST | `/api/aliases` | `credential.self.manage` |

## Settlements & reconciliation (spec)

| Method | Path | Permission |
|--------|------|-----------|
| GET  | `/api/settlements` | `settlement.read.all` / `settlement.self.read` |
| POST | `/api/settlements/batches` | `settlement.batch.manage` → `PassPassProvider::createSettlement` |
| GET  | `/api/reconciliation/batches` | `reconciliation.manage` |
| POST | `/api/reconciliation/run` | `reconciliation.manage` |

## Providers & routing (admin, spec)

| Method | Path | Permission |
|--------|------|-----------|
| GET  | `/api/providers` | `platform.provider.manage` |
| GET  | `/api/routing` | `platform.routing.manage` | (returns `PaymentRouter::table()`) |
| PUT  | `/api/routing` | `platform.routing.manage` |

## Webhooks (spec)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/webhooks/{provider}` | HMAC-verified via `…Provider::handleWebhook`; logged to `webhooks`; updates transaction + writes `transaction_events`. Signature header per provider (e.g. `X-PassPass-Signature`). |

## Reports (spec)

| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/reports/kpis` | `report.read.all` |
| GET | `/api/reports/transactions.csv` | `report.self.read` |
