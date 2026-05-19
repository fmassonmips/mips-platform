# Architecture

System-level view of the MIPS Booking & Payment Engine. For the product *what* and *why*, see [`PILATES_MVP_SPEC.md`](./PILATES_MVP_SPEC.md).

## 1. Goals and non-goals

**Architectural goals**
- Atomic *book + pay + decrement* — no overbooking, no double-charges, no ledger drift.
- Idempotent payment pipeline (webhooks, reconciliation, retries).
- A single retention loop (low-balance trigger) running as a first-class background job.
- Replaceable integrations behind narrow ports (MIPS, SMS, email).

**Non-goals (MVP)**
- Multi-region active/active.
- Polyglot persistence.
- Event sourcing / CQRS.
- Native mobile.

## 2. Runtime topology

```
                ┌────────────────────────┐
                │   Customer PWA (React) │
                │   /studio/* PWA (admin)│
                └──────────┬─────────────┘
                           │ HTTPS
                           ▼
              ┌─────────────────────────────┐
              │       Nginx (TLS, LB)        │
              └──────────┬──────────────────┘
                         │
              ┌──────────▼──────────┐
              │   PHP-FPM (app x2)  │   stateless app nodes
              │   Laravel + APIs    │
              └──┬───────┬──────────┘
                 │       │
       ┌─────────┘       └────────────────┐
       ▼                                  ▼
┌─────────────┐                  ┌─────────────────┐
│  MariaDB    │◄─── replica ────│ MariaDB replica  │
│  (primary)  │                  └─────────────────┘
└─────┬───────┘
      │
      ▼
┌─────────────┐
│   Redis     │  sessions · rate-limits · seat-hold TTL · queue backend
└─────┬───────┘
      │
      ▼
┌──────────────────────────────┐
│  Workers (Laravel queue)     │
│   · notification outbox      │
│   · MIPS reconciliation      │
│   · seat-hold reaper         │
│   · expiry warnings          │
└──────────────────────────────┘

External:
   MIPS gateway (card + Juice + tokenization + reversal)
   SMS aggregator (local + Twilio fallback)
   Email provider (Postmark / SES)
```

## 3. Module map

```
src/
├── Auth/                  staff auth (session) + customer auth (OTP, magic link, JWT)
├── Booking/               class instances, seat hold, cancellation
├── Catalog/               studio, room, instructor, class type, package
├── Customer/              CRM, status engine
├── Ledger/                package_credit + session_ledger_entry (append-only)
├── Notification/          outbox, templates, providers
├── Payment/               MIPS port + payment intents + webhooks + refunds
├── Admin/                 dashboards, schedule editor, attendance
├── Webhooks/              MIPS, SMS-status, email-status
├── Support/               shared (Validator, Csrf, Response, RateLimiter)
└── bootstrap.php
```

The existing repo already has `Auth/`, `Support/`, and parts of `bootstrap.php`. Sprint 1 adds the booking + catalog modules; Sprint 3 adds the payment + ledger modules.

## 4. Request lifecycle (booking)

```
HTTP POST /api/v1/bookings
   │
   ▼
[Auth middleware] verify JWT → resolves customer_id
   │
   ▼
[CSRF / Idempotency middleware] check Idempotency-Key
   │
   ▼
[BookingController::create]
   │
   ▼
DB tx:
  SELECT capacity FOR UPDATE
  INSERT booking(status=PENDING, hold_expires_at=now()+10m)
COMMIT
   │
   ▼
[PaymentController::createIntent]
  call MIPS createPayment → redirect_url
   │
   ▼
return 201 {booking_id, payment_intent: {redirect_url, payment_id}}
```

Asynchronous continuation:

```
MIPS → POST /webhooks/mips  (signed)
   │
   ▼
[WebhookController::mips]
  verify HMAC
  SELECT payment WHERE mips_payment_id = ? FOR UPDATE
  if status already terminal → 200 (idempotent no-op)
  ELSE:
     DB tx:
        UPDATE payment SET status=SUCCEEDED
        debit oldest package_credit (insert session_ledger_entry)
        UPDATE booking SET status=CONFIRMED
        INSERT notification(booking_confirmed)
        IF total_remaining == 1: INSERT notification(low_balance)
     COMMIT
   │
   ▼
200 OK
```

## 5. Data plane invariants

- A `Booking` is `CONFIRMED` iff exactly one `Payment.SUCCEEDED` row references it AND exactly one `SessionLedgerEntry(DEBIT)` references it. Enforced by transaction boundary, not by app code.
- `class_instance.remaining_capacity` is **derived**, never stored.
- `package_credit.sessions_used` is a denormalized counter; the **truth** is the sum of `session_ledger_entry.delta`. A nightly job reconciles the counter to the ledger and alerts on drift.
- `mips_payment_id` is the universal idempotency key for the payment plane.
- Every write that crosses a money or credit boundary writes an `audit_log` row in the same transaction.

## 6. Concurrency strategy

Three contention points:

| Point | Risk | Strategy |
|---|---|---|
| Last mat in a class | Two customers reserve simultaneously | `SELECT capacity FOR UPDATE` + count of holds in the same tx |
| Webhook duplicate delivery | Double-confirm + double-debit | `payment.mips_payment_id` UNIQUE + status-machine guard |
| Concurrent ledger debit | Race on choosing oldest credit | `SELECT package_credit ... ORDER BY expires_at FOR UPDATE` |

Seat hold reaper runs every 60s and releases PENDING bookings whose `hold_expires_at < now()`.

## 7. Failure modes (and how they degrade)

| Failure | Behavior |
|---|---|
| MIPS gateway down | Booking endpoint returns 503 with retry-after. Admin can switch to "pay at studio" mode in settings. |
| Webhook lost | Reconciliation worker polls MIPS for `PENDING > 10 min` payments every 5 min. |
| SMS provider down | Outbox retries (3 attempts, exponential backoff). Email still goes out. Owner sees red badge in dashboard. |
| Primary DB down | App returns 503; replica is read-only and only used for analytics. Manual failover documented in `operations.md`. |
| Redis down | Sessions degrade to DB-backed (slower); seat holds fall back to DB column `hold_expires_at`. |

## 8. Security boundaries

- TLS terminates at Nginx; internal traffic is plain HTTP on a private network.
- The app **never** sees a PAN. MIPS hosted page captures card details; we receive `mips_payment_id` + `mips_token` only.
- Webhook integrity = HMAC-SHA256 over the raw body with `webhook_secret`. Constant-time comparison.
- Customer JWT is short-lived (24h) and stored in `HttpOnly; Secure; SameSite=Lax` cookies.
- Staff sessions use the existing `Session.php` machinery with rotation on privilege change.

More in [`security.md`](./security.md).

## 9. Observability

- **Logs**: structured JSON to stdout. Fields: `request_id`, `actor_type`, `actor_id`, `studio_id`, `route`, `latency_ms`, `outcome`.
- **Metrics** (Prometheus or Better Stack):
  - `bookings_created_total{status=...}`
  - `payments_total{method,status}`
  - `webhook_received_total{source,outcome}`
  - `notification_sent_total{channel,template,outcome}`
  - `seat_hold_expired_total`
  - Histogram: `payment_to_confirmation_seconds`
- **Tracing**: OpenTelemetry on the booking + payment paths. One trace = one customer intent.
- **Alerts**:
  - `payment_to_confirmation_seconds_p95 > 30s` for 5m
  - Webhook 5xx rate > 1% for 5m
  - Reconciliation diff > 0
  - SMS delivery rate < 90% over 1h

## 10. Deployment

- Two stateless app nodes behind Nginx. Rolling deploy: drain → deploy → warm → flip.
- DB primary + replica. Replica is async; analytics queries only.
- Redis single-node with AOF persistence (acceptable for MVP volumes).
- Backups: nightly mysqldump + binlog shipped to object storage. Restore drill quarterly.

See [`operations.md`](./operations.md) for the runbook.
