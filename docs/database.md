# Database Reference

Full schema reference. The canonical DDL lives in `sql/schema.sql` (current scope: auth) and in §20 of [`PILATES_MVP_SPEC.md`](./PILATES_MVP_SPEC.md) (booking, payment, ledger — to be migrated in Sprint 1).

This document explains each table: purpose, columns, indexes, invariants, common queries.

## 0. Conventions

- Engine: **InnoDB**. Charset: **utf8mb4 / utf8mb4_unicode_ci**.
- PK type: `BIGINT UNSIGNED AUTO_INCREMENT`.
- External IDs: `BINARY(16)` UUID v4 in a `uuid` column, indexed UNIQUE. Never expose internal `id` over HTTP.
- Money: `BIGINT amount_minor` (MUR cents). Never floats. Currency in a sibling `CHAR(3)`.
- Timestamps: `DATETIME`, stored UTC. App layer translates to `Indian/Mauritius`.
- Soft deletes: not used in MVP. Cancellations are status transitions, not deletes.

## 1. Entity-relationship overview

```
       studio ─┬── room
               ├── instructor ── user (staff, optional)
               ├── class_type
               ├── package (catalog)
               └── customer
                       │
                       ├── package_credit ── session_ledger_entry
                       ├── booking ──┐
                       ├── payment ──┘
                       ├── card_token
                       └── notification

       class_instance (per studio, per class_type, per room, per instructor)
            │
            └── booking (many)

       audit_log (cross-entity, append-only)
```

## 2. Tables

### 2.1 `users` (staff — existing)

Source: `sql/schema.sql`. Used for studio owners, instructors with login, and front-desk staff.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `studio_id` | BIGINT UNSIGNED NULL | added in Sprint 1, FK→studio |
| `email` | VARCHAR(254) UNIQUE | |
| `password_hash` | VARCHAR(255) | bcrypt/argon2id |
| `name` | VARCHAR(120) | |
| `role` | VARCHAR(32) | `owner`, `instructor`, `frontdesk`, `admin` |
| `is_active` | TINYINT(1) | |
| `created_at`, `updated_at` | DATETIME | |

Indexes: `uq_users_email(email)`, `idx_users_is_active(is_active)`, `idx_users_studio(studio_id)`.

### 2.2 `login_attempts` (existing)

Rate-limit support for staff login. Unchanged for MVP.

### 2.3 `studio`

Each studio is a tenant. The platform is multi-tenant from day 0.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | BINARY(16) UNIQUE | external ID |
| `handle` | VARCHAR(64) UNIQUE | URL slug, e.g. `lea-pilates` |
| `name` | VARCHAR(160) | |
| `timezone` | VARCHAR(64) | default `Indian/Mauritius` |
| `currency` | CHAR(3) | default `MUR` |
| `mips_merchant_id` | VARCHAR(64) | per-studio MIPS merchant credential |
| `settings_json` | JSON | cancellation policy, cutoffs, notification toggles |

**Invariant**: a customer always belongs to exactly one studio. Multi-studio customers in Phase 2.

### 2.4 `customer`

Distinct from `users`. Customers authenticate via OTP/magic link (no password).

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | BINARY(16) UNIQUE | |
| `studio_id` | BIGINT UNSIGNED | FK→studio |
| `phone_e164` | VARCHAR(20) | E.164 format; identity key |
| `email` | VARCHAR(254) | optional, used for magic link |
| `name` | VARCHAR(160) | |
| `locale` | VARCHAR(8) | `fr-MU` or `en-MU` |
| `status` | ENUM | `ACTIVE` / `INACTIVE` / `LOW_BALANCE` / `EXPIRED` |
| `sms_contactable`, `email_contactable` | TINYINT(1) | preference flags |

Indexes:
- `uq_customer_studio_phone(studio_id, phone_e164)` — phone is unique per studio
- `idx_customer_status(studio_id, status)` — admin filter
- `uq_customer_uuid(uuid)`

**Status engine**: a worker recomputes nightly.
- `ACTIVE`: ≥1 active package with `remaining > 0` AND attended within last 30 days.
- `LOW_BALANCE`: `remaining = 1`.
- `EXPIRED`: all packages expired.
- `INACTIVE`: no attended class in 60+ days.

### 2.5 `class_type`, `room`, `instructor`, `package`

Catalog tables. Trivial CRUD; see [`PILATES_MVP_SPEC.md` §20](./PILATES_MVP_SPEC.md) for DDL.

`package` notes:
- `sessions_total` ≥ 1; a "drop-in" is `sessions_total = 1`, `validity_days = 1`.
- `price_minor` is the customer-facing price. MIPS fees are reported separately.
- `is_active = 0` deactivates from new purchases but keeps existing credits valid.

### 2.6 `class_instance`

A concrete class scheduled at a date/time.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | BINARY(16) UNIQUE | |
| `studio_id` | BIGINT UNSIGNED | |
| `class_type_id`, `instructor_id`, `room_id` | FKs | |
| `starts_at`, `ends_at` | DATETIME UTC | |
| `capacity` | INT | mat count |
| `status` | ENUM | `DRAFT` / `PUBLISHED` / `CANCELLED` |
| `cutoff_minutes` | INT | default 15 |
| `cancel_free_window_h` | INT | default 12 |
| `policy_snapshot_json` | JSON | copied from studio settings at publish; freezes policy per class |

Indexes:
- `idx_ci_studio_time(studio_id, starts_at)` — calendar query
- `idx_ci_status(status)` — publish workflows

**Invariant**: `capacity` cannot be reduced below `COUNT(booking WHERE status IN ('PENDING','CONFIRMED'))`. Enforced at the application layer with a DB CHECK as a belt-and-braces.

### 2.7 `booking`

The core OLTP table.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | BINARY(16) UNIQUE | |
| `customer_id`, `class_instance_id` | FKs | |
| `status` | ENUM | see below |
| `hold_expires_at` | DATETIME NULL | for `PENDING` only |
| `consumed_credit_id` | BIGINT UNSIGNED NULL | FK→package_credit on debit |
| `created_at`, `updated_at` | DATETIME | |

Status enum:
- `PENDING` — seat held, awaiting payment.
- `CONFIRMED` — payment succeeded, session debited.
- `ATTENDED` — instructor checked them in.
- `NO_SHOW` — class ended, no check-in.
- `CANCELLED_BY_CUSTOMER` — customer cancelled within free window.
- `CANCELLED_BY_STUDIO` — studio cancelled the class.
- `CANCELLED_FAILED_PAYMENT` — payment failed or timed out.
- `CANCELLED_REFUNDED` — refunded after confirmation.

Indexes:
- `idx_b_class_status(class_instance_id, status)` — **hot path**: remaining-capacity calc.
- `idx_b_customer(customer_id, created_at)` — "my bookings" view.
- `uq_b_one_pending` — partial unique on `(customer_id, class_instance_id) WHERE status='PENDING'`.

State machine:

```
       ┌──────────────── CANCELLED_FAILED_PAYMENT
       │
   PENDING ───pay ok───► CONFIRMED ───attended───► ATTENDED
       │                     │
       │                     ├──no-show──► NO_SHOW
       │                     │
       │                     ├──customer cancel (free window)──► CANCELLED_BY_CUSTOMER
       │                     │
       │                     ├──studio cancel──► CANCELLED_BY_STUDIO
       │                     │
       │                     └──refund issued──► CANCELLED_REFUNDED
       │
       └──hold expired──► (deleted by reaper) or CANCELLED_FAILED_PAYMENT
```

### 2.8 `package_credit`

A consumable balance owned by a customer.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | BINARY(16) UNIQUE | |
| `customer_id` | FK | |
| `source_package_id` | FK NULL | nullable for comp credits |
| `sessions_total` | INT | |
| `sessions_used` | INT | denormalized counter |
| `purchased_at`, `expires_at` | DATETIME | |

Constraints:
- CHECK `sessions_used BETWEEN 0 AND sessions_total`.

Indexes:
- `idx_pc_customer_exp(customer_id, expires_at)` — the credit selection query.

**Invariant**: `sessions_used == -SUM(session_ledger_entry.delta WHERE package_credit_id=this.id)`. Nightly reconciliation job verifies.

### 2.9 `session_ledger_entry`

Append-only ledger. **Never UPDATE, never DELETE.**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `package_credit_id` | FK | |
| `booking_id` | FK NULL | NULL for manual adjustments |
| `delta` | INT | typically -1 (debit) or +1 (credit) |
| `reason` | ENUM | `BOOKING_CONFIRMED`, `BOOKING_CANCELLED_FREE`, `NO_SHOW`, `MANUAL_ADJUSTMENT`, `REFUND_RECREDIT`, `EXPIRY` |
| `actor_user_id` | FK NULL | NULL for system, set for manual ops |
| `created_at` | DATETIME | |

Indexes:
- `idx_sle_pc(package_credit_id, created_at)` — balance reconstruction.
- `idx_sle_booking(booking_id)` — booking → ledger join.

Why an explicit ledger? Reasons:
1. The denormalized `sessions_used` counter can drift; the ledger is the truth.
2. Audit trail by construction.
3. Reports trivially `GROUP BY reason`.
4. Refunds become compensating entries, not corrections.

### 2.10 `payment`

Every money movement.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `uuid` | BINARY(16) UNIQUE | |
| `customer_id` | FK | |
| `booking_id` | FK NULL | set when payment is for a single class |
| `package_credit_id` | FK NULL | set when payment is for a package purchase |
| `method` | ENUM | `JUICE`, `CARD`, `CASH`, `COMP` |
| `amount_minor` | BIGINT | |
| `currency` | CHAR(3) | `MUR` |
| `mips_payment_id` | VARCHAR(80) UNIQUE | **the universal idempotency key** |
| `mips_status` | VARCHAR(40) | raw MIPS status string |
| `status` | ENUM | `INITIATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED` |
| `fee_minor` | BIGINT | MIPS fee, for net revenue reports |
| `raw_payload` | JSON | full MIPS response for forensics |
| `succeeded_at`, `refunded_at` | DATETIME NULL | |

Indexes:
- `uq_p_mips(mips_payment_id)` — idempotency guard.
- `idx_p_customer(customer_id)`, `idx_p_status(status)`.

**Invariant**: exactly one of (`booking_id`, `package_credit_id`) is non-null. App-layer constraint.

### 2.11 `card_token`

Saved MIPS tokens for one-tap renewal. **No PAN, ever.**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `customer_id` | FK | |
| `mips_token` | VARCHAR(120) | opaque MIPS-side token |
| `brand`, `last4` | display only | |
| `exp_month`, `exp_year` | small ints | |
| `is_default` | TINYINT(1) | |

Customers can revoke a token from the account screen (sends a `revoke` call to MIPS).

### 2.12 `notification`

Outbox pattern. Workers drain it.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `customer_id` | FK | |
| `channel` | ENUM | `SMS`, `EMAIL` |
| `template_key` | VARCHAR(80) | e.g. `low_balance.fr` |
| `payload_json` | JSON | template variables |
| `status` | ENUM | `QUEUED`, `SENT`, `FAILED`, `BOUNCED` |
| `provider_message_id` | VARCHAR(120) | for delivery-receipt joins |
| `attempts` | TINYINT | |
| `scheduled_at`, `sent_at` | DATETIME | |
| `last_error` | TEXT | |

Indexes:
- `idx_n_status_sched(status, scheduled_at)` — worker poll.
- `idx_n_customer(customer_id)` — admin view.

### 2.13 `audit_log`

Append-only. Every money or credit operation, every admin override.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `actor_user_id` | FK NULL | staff actor |
| `actor_customer_id` | FK NULL | customer actor |
| `action` | VARCHAR(80) | e.g. `booking.refund`, `credit.manual_adjust` |
| `entity_type`, `entity_id` | | target row |
| `before_json`, `after_json` | JSON | row snapshot |
| `created_at` | DATETIME | |

Indexes: `idx_al_entity(entity_type, entity_id)`, `idx_al_actor(actor_user_id, created_at)`.

## 3. Common queries

### Remaining capacity for a class

```sql
SELECT ci.capacity
     - (SELECT COUNT(*) FROM booking
        WHERE class_instance_id = ci.id
          AND status IN ('PENDING','CONFIRMED','ATTENDED','NO_SHOW')) AS remaining
FROM class_instance ci
WHERE ci.id = ?;
```

### Customer total remaining sessions

```sql
SELECT COALESCE(SUM(sessions_total - sessions_used), 0) AS remaining
FROM package_credit
WHERE customer_id = ?
  AND expires_at > NOW()
  AND sessions_used < sessions_total;
```

### Oldest active credit to debit (FOR UPDATE)

```sql
SELECT id, sessions_total, sessions_used
FROM package_credit
WHERE customer_id = ?
  AND expires_at > NOW()
  AND sessions_used < sessions_total
ORDER BY expires_at ASC, id ASC
LIMIT 1
FOR UPDATE;
```

### Bookings in next 24h needing the T-2h SMS

```sql
SELECT b.id, c.id AS customer_id, c.phone_e164, ci.starts_at
FROM booking b
JOIN class_instance ci ON ci.id = b.class_instance_id
JOIN customer c ON c.id = b.customer_id
WHERE b.status = 'CONFIRMED'
  AND ci.starts_at BETWEEN NOW() + INTERVAL 2 HOUR
                       AND NOW() + INTERVAL 2 HOUR + INTERVAL 5 MINUTE
  AND NOT EXISTS (SELECT 1 FROM notification n
                  WHERE n.customer_id = c.id
                    AND n.template_key = 'class_reminder_2h.fr'
                    AND n.payload_json->>'$.booking_id' = b.uuid);
```

### Reconciliation drift detector

```sql
SELECT pc.id,
       pc.sessions_used,
       -COALESCE(SUM(sle.delta), 0) AS ledger_used,
       pc.sessions_used + COALESCE(SUM(sle.delta), 0) AS drift
FROM package_credit pc
LEFT JOIN session_ledger_entry sle ON sle.package_credit_id = pc.id
GROUP BY pc.id
HAVING drift <> 0;
```

If `drift <> 0` for any row, alert immediately — invariant violated.

## 4. Migrations

Until Laravel migrations land in Sprint 1, raw SQL files numbered in `sql/migrations/`:

```
sql/
├── schema.sql                 ← current bootstrap
├── seed.sql
└── migrations/
    ├── 2026_05_20_0001_add_studio_and_customer.sql
    ├── 2026_05_20_0002_add_catalog.sql
    ├── 2026_05_27_0001_add_class_instance.sql
    ├── 2026_05_27_0002_add_booking.sql
    ├── 2026_06_03_0001_add_package_credit_and_ledger.sql
    ├── 2026_06_10_0001_add_payment_and_card_token.sql
    ├── 2026_06_17_0001_add_notification.sql
    └── 2026_06_24_0001_add_audit_log.sql
```

Each migration is forward-only. Rollback by writing a paired `*_down.sql` only when destructive.
