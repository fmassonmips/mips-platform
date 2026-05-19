# API Reference

HTTP API for the MIPS Booking & Payment Engine. All endpoints under `/api/v1`. JSON request and response bodies. Times in ISO 8601 UTC.

## 0. Conventions

### Authentication
- **Customer endpoints**: `Authorization: Bearer <jwt>` issued by `/auth/otp/verify` or `/auth/magic/verify`. Lifetime 24h, refresh via re-auth.
- **Admin endpoints**: session cookie issued by `/login.php` (existing). Cookie is `HttpOnly; Secure; SameSite=Lax`.
- **Webhooks**: HMAC-SHA256 signature in `X-MIPS-Signature` over the raw request body; verified with constant-time comparison.

### Idempotency
Every `POST` and `PATCH` accepts an `Idempotency-Key` header (UUID). Server stores `(key, response)` for 24h and replays on repeat.

### Error envelope
```json
{
  "error": {
    "code": "BOOKING_FULL",
    "message": "Class is full",
    "request_id": "req_01HXYZ123ABC"
  }
}
```

Common codes:

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Field-level errors in `error.fields` |
| 401 | `UNAUTHENTICATED` | Missing or expired token |
| 403 | `FORBIDDEN` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | |
| 409 | `BOOKING_FULL` | Class is full |
| 409 | `ALREADY_BOOKED` | Customer has a non-cancelled booking for this class |
| 409 | `INSUFFICIENT_CREDIT` | No active package credit to debit |
| 410 | `BOOKING_HOLD_EXPIRED` | PENDING booking aged out |
| 422 | `POLICY_VIOLATION` | Action blocked by studio policy (e.g. cancel after window) |
| 429 | `RATE_LIMITED` | Includes `Retry-After` header |
| 502 | `PAYMENT_GATEWAY_ERROR` | MIPS upstream failure |
| 503 | `PAYMENT_GATEWAY_UNAVAILABLE` | MIPS unreachable |

### Pagination
Cursor-based: `?cursor=<opaque>&limit=20`. Response: `{ "data": [...], "next_cursor": "..." }`.

### Money
All amounts are integers in **minor units of MUR**. `4500` = MUR 45.00.

---

## 1. Authentication

### `POST /api/v1/auth/otp/request`
Request an OTP for a phone number.

Request:
```json
{ "phone": "+23051234567" }
```
Response `204 No Content`. Rate-limited 5/hour/phone.

### `POST /api/v1/auth/otp/verify`
Exchange OTP for a JWT.

Request:
```json
{ "phone": "+23051234567", "code": "482103", "studio_handle": "lea-pilates" }
```
Response:
```json
{
  "token": "eyJhbGciOi...",
  "expires_at": "2026-05-20T08:30:00Z",
  "customer": { "uuid": "...", "name": "Priya", "locale": "fr-MU" }
}
```
On first verify, customer is auto-created with `name` blank — client must follow up with `PATCH /me`.

### `POST /api/v1/auth/magic/request`
```json
{ "email": "priya@example.com" }
```
Response `204`. Sends magic link.

### `GET /api/v1/auth/magic/verify?token=<token>`
Validates token, returns same shape as `otp/verify`.

---

## 2. Customer profile

### `GET /api/v1/me`
Returns the authenticated customer.

```json
{
  "uuid": "9a7e...",
  "name": "Priya Ramen",
  "phone": "+23051234567",
  "email": "priya@example.com",
  "locale": "fr-MU",
  "status": "ACTIVE",
  "packages": [
    {
      "uuid": "pc_...",
      "name": "10-Pack Pilates Mat",
      "sessions_total": 10,
      "sessions_used": 3,
      "sessions_remaining": 7,
      "expires_at": "2026-07-19T00:00:00Z"
    }
  ],
  "saved_cards": [
    { "id": "ct_1", "brand": "VISA", "last4": "4242", "exp": "12/27", "is_default": true }
  ],
  "prefs": { "sms": true, "email": true }
}
```

### `PATCH /api/v1/me`
```json
{ "name": "Priya Ramen", "email": "priya@example.com", "locale": "fr-MU",
  "prefs": { "sms": true, "email": true } }
```

---

## 3. Studio & Catalog

### `GET /api/v1/studios/:handle`
Public. Returns studio info + branding.

```json
{
  "uuid": "...", "handle": "lea-pilates", "name": "Léa Pilates",
  "timezone": "Indian/Mauritius", "currency": "MUR",
  "packages": [
    { "uuid": "...", "name": "Drop-in", "sessions_total": 1, "price_minor": 45000, "validity_days": 1 },
    { "uuid": "...", "name": "5-pack",  "sessions_total": 5, "price_minor": 200000, "validity_days": 60 }
  ]
}
```

### `GET /api/v1/studios/:handle/classes?from=2026-05-19&to=2026-05-25`
Returns published classes in the window.

```json
{
  "data": [
    {
      "uuid": "ci_...",
      "class_type": "Pilates Mat Beginner",
      "instructor": "Léa",
      "room": "Studio A",
      "starts_at": "2026-05-20T14:30:00Z",
      "ends_at":   "2026-05-20T15:30:00Z",
      "capacity": 12,
      "remaining": 4,
      "status": "PUBLISHED"
    }
  ]
}
```

### `GET /api/v1/classes/:uuid`
Single class detail.

---

## 4. Bookings

### `POST /api/v1/bookings`
Create a PENDING booking. Returns a payment intent if the customer must pay; or directly confirms if a package credit is used.

Headers: `Authorization`, `Idempotency-Key`.

Request:
```json
{
  "class_instance_uuid": "ci_...",
  "payment_choice": "USE_CREDIT" | "BUY_PACKAGE" | "BUY_DROPIN",
  "package_uuid": "pkg_..."     // required if BUY_PACKAGE
}
```

Response (must pay):
```json
{
  "booking": { "uuid": "b_...", "status": "PENDING", "hold_expires_at": "..." },
  "payment_intent": {
    "payment_id": "p_...",
    "method_options": ["JUICE", "CARD"],
    "redirect_url": "https://sandbox.mips.mu/pay/..."
  }
}
```

Response (used credit):
```json
{
  "booking": { "uuid": "b_...", "status": "CONFIRMED", "consumed_credit_uuid": "pc_..." },
  "remaining_total_sessions": 6
}
```

Errors: `BOOKING_FULL`, `ALREADY_BOOKED`, `INSUFFICIENT_CREDIT`, `POLICY_VIOLATION` (cutoff passed).

### `GET /api/v1/bookings/:uuid`
Read booking; ownership-checked.

### `DELETE /api/v1/bookings/:uuid`
Cancel. Behavior:
- Within `cancel_free_window_h`: re-credit session, mark `CANCELLED_BY_CUSTOMER`.
- Outside: returns 422 `POLICY_VIOLATION` with `{ "policy": "...", "until": "..." }`.

### `GET /api/v1/bookings/mine?status=upcoming|past&cursor=`
List own bookings.

---

## 5. Packages

### `POST /api/v1/packages/purchase`
Buy a package. Returns a payment intent.

```json
{ "package_uuid": "pkg_..." }
```

Response: same shape as the `BUY_PACKAGE` booking response — minus the booking.

### `GET /api/v1/packages/mine`
Same as `me.packages` but with full ledger history per credit.

---

## 6. Payments

### `POST /api/v1/payments/intent`
Re-create or refresh a payment intent for a still-PENDING booking (e.g. user closed the tab and came back).

```json
{ "booking_uuid": "b_...", "method": "JUICE" | "CARD" }
```

### `GET /api/v1/payments/:uuid`
Poll payment status. Webhook is the source of truth; polling is a UX fallback.

### `POST /api/v1/payments/one-tap-renew`
Renew a package with a saved card token. No redirect; charges immediately.

```json
{ "package_uuid": "pkg_...", "card_token_id": "ct_..." }
```

Response:
```json
{ "payment_id": "p_...", "status": "SUCCEEDED", "package_credit_uuid": "pc_..." }
```

Errors: `PAYMENT_GATEWAY_ERROR`, `CARD_DECLINED`, `TOKEN_EXPIRED`.

---

## 7. Webhooks

### `POST /api/v1/webhooks/mips`
Signed payload from MIPS. Idempotent on `mips_payment_id`.

Expected headers: `X-MIPS-Signature: sha256=<hex>`, `X-MIPS-Event: payment.succeeded|payment.failed|payment.refunded`.

Body (success example):
```json
{
  "event": "payment.succeeded",
  "payment_id": "mips_pay_abc123",
  "merchant_reference": "b_01HXYZ...",
  "amount_minor": 200000,
  "currency": "MUR",
  "method": "JUICE",
  "fee_minor": 4000,
  "card_token": null,
  "timestamp": "2026-05-19T08:31:02Z"
}
```

Response: always `200 OK` once the event is recorded, even on duplicate.

### `POST /api/v1/webhooks/sms-status`, `/email-status`
Delivery receipts. Update `notification.status` and `provider_message_id`.

---

## 8. Admin endpoints

All require staff session and `role IN ('owner', 'instructor', 'frontdesk', 'admin')` (per-endpoint authz).

### `GET /api/v1/admin/today`
Owner's home screen.

```json
{
  "date": "2026-05-19",
  "classes": [
    { "uuid": "ci_...", "starts_at": "...", "instructor": "Léa",
      "capacity": 12, "booked": 9, "checked_in": 0 }
  ],
  "revenue_today_minor": 145000,
  "no_shows_today": 1,
  "refunds_today_minor": 0
}
```

### `GET /api/v1/admin/schedule?week=2026-W21`
Week grid.

### `POST /api/v1/admin/classes`
```json
{ "class_type_uuid": "ct_...", "instructor_uuid": "...", "room_uuid": "...",
  "starts_at": "2026-05-21T13:30:00Z", "duration_min": 60, "capacity": 12,
  "status": "DRAFT" | "PUBLISHED" }
```

### `PATCH /api/v1/admin/classes/:uuid`
Edit. Cannot reduce capacity below current bookings (returns 422).

### `DELETE /api/v1/admin/classes/:uuid`
Cancel class. Auto-refunds all CONFIRMED bookings and emits `studio_cancelled` notifications.

### `POST /api/v1/admin/classes/:uuid/checkin`
Mark a customer present or absent.

```json
{ "customer_uuid": "...", "status": "ATTENDED" | "NO_SHOW" }
```

### `GET /api/v1/admin/customers?status=LOW_BALANCE&q=priya&cursor=`
Filter + search.

### `GET /api/v1/admin/customers/:uuid`
Full profile, includes balances, history, notifications.

### `POST /api/v1/admin/customers/:uuid/credit`
Manual credit adjustment. Audit-logged.

```json
{ "sessions": +1, "reason": "Goodwill" }
```

### `POST /api/v1/admin/bookings/:uuid/refund`
```json
{ "mode": "FULL" | "PARTIAL" | "CREDIT", "amount_minor": 50000 }
```
- `CREDIT`: re-credits package only, no MIPS call.
- `FULL`/`PARTIAL`: MIPS reversal.

### `GET /api/v1/admin/revenue?from=2026-05-01&to=2026-05-31`
Aggregated revenue with `fee_minor` deduction.

### `GET /api/v1/admin/notifications?status=FAILED&cursor=`
For diagnosing the retention loop.

### `GET|PATCH /api/v1/admin/settings`
Studio settings.

### CRUD `/api/v1/admin/packages`

---

## 9. Rate limits

| Endpoint | Limit |
|---|---|
| `/auth/otp/request` | 5/h/phone, 20/h/IP |
| `/auth/magic/request` | 5/h/email, 20/h/IP |
| `/bookings` (POST) | 60/min/customer |
| `/payments/one-tap-renew` | 10/min/customer |
| Admin endpoints | 600/min/user |

Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. On 429: `Retry-After: <seconds>`.

## 10. Versioning

`/api/v1` is stable. Breaking changes ship as `/api/v2` with a 6-month overlap. Additive fields (new optional response keys) ship inside v1 without version bump.

## 11. OpenAPI

`/api/v1/openapi.json` is served at runtime (Sprint 6). The spec is the contract; this document is the explanation.
