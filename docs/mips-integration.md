# MIPS Integration

Everything that crosses the boundary between this platform and MIPS — the Mauritius IPS gateway. MIPS is treated as a port; the implementation lives in `src/Payment/Mips/*`.

## 1. Scope

| Capability | Used for |
|---|---|
| **Hosted Payment Page** | Card (Visa / Mastercard / Amex via 3DS) |
| **Juice** | MCB Juice push payment |
| **Tokenization** | Save card for one-tap renewal |
| **Reversal / Refund** | Cancellation, studio-cancelled class |
| **Settlement files** | Daily reconciliation |
| **Webhook** | Asynchronous status notifications |

No PAN ever touches our servers. Cards are entered on MIPS-hosted pages; we receive only `mips_payment_id` and (with customer consent) `mips_token`.

## 2. Environments

| Env | URL | Credentials |
|---|---|---|
| Sandbox | `https://sandbox.mips.mu` | `SANDBOX-001` / `sandbox_key` |
| Production | TBD per studio | `mips_merchant_id` stored in `studio.mips_merchant_id` |

Each studio is its own MIPS merchant — we never co-mingle merchants. Multi-studio split (one platform merchant + revenue share) is Phase 3.

## 3. Configuration

```php
// config/config.php
'mips' => [
    'base_url'        => env('MIPS_BASE_URL', 'https://sandbox.mips.mu'),
    'webhook_secret'  => env('MIPS_WEBHOOK_SECRET'),
    'timeout_seconds' => 15,
    'connect_timeout_seconds' => 5,
    'retry' => [
        'attempts' => 3,
        'backoff_ms' => [200, 800, 2000],
    ],
],
```

Per-studio overrides (`merchant_id`, `api_key`) come from `studio.settings_json`.

## 4. Payment intent — happy path

```
client                  app                       MIPS
  │ POST /bookings        │                          │
  │ (status=PENDING)──────►                          │
  │                       │ createPayment            │
  │                       │ amount=200000 MUR        │
  │                       │ ref=booking_uuid         │
  │                       │ callback_url=/webhooks   │
  │                       │ return_url=/bookings/:id │
  │                       │─────────────────────────►│
  │                       │       payment_id +        │
  │                       │       redirect_url       │
  │                       │◄─────────────────────────│
  │ 201 + redirect_url    │                          │
  │◄──────────────────────│                          │
  │ 302 to redirect_url ──────────────────────────► MIPS hosted page
  │                                                  │
  │ user pays (Juice push or card 3DS)               │
  │                       │                          │
  │                       │      webhook (signed)    │
  │                       │◄─────────────────────────│
  │                       │ verify + confirm booking │
  │                       │       200 OK             │
  │                       │─────────────────────────►│
  │ 302 to return_url ◄──────────────────────────── MIPS
  │ GET /bookings/:id     │                          │
  │ (status=CONFIRMED)    │                          │
```

## 5. The `createPayment` call

Request:
```http
POST {base_url}/v1/payments HTTP/1.1
Authorization: Bearer {api_key}
Content-Type: application/json
X-Merchant-Id: {mips_merchant_id}
Idempotency-Key: {payment_uuid}

{
  "amount_minor": 200000,
  "currency": "MUR",
  "merchant_reference": "b_01HXYZ...",
  "method_allowed": ["JUICE", "CARD"],
  "save_card": true,
  "callback_url": "https://api.mips.studio/api/v1/webhooks/mips",
  "return_url":   "https://app.mips.studio/bookings/b_01HXYZ.../return",
  "customer": {
    "name":  "Priya Ramen",
    "email": "priya@example.com",
    "phone": "+23051234567"
  }
}
```

Response:
```json
{
  "payment_id": "mips_pay_abc123",
  "status": "INITIATED",
  "redirect_url": "https://sandbox.mips.mu/pay/abc123",
  "expires_at": "2026-05-19T08:45:00Z"
}
```

We persist immediately:
```sql
INSERT INTO payment (uuid, customer_id, booking_id, method,
                     amount_minor, currency,
                     mips_payment_id, status)
VALUES (..., 'JUICE_OR_CARD', 200000, 'MUR', 'mips_pay_abc123', 'INITIATED');
```

## 6. Webhook handling

Endpoint: `POST /api/v1/webhooks/mips`

### 6.1 Signature verification

```php
$raw = file_get_contents('php://input');
$sigHeader = $request->header('X-MIPS-Signature');  // "sha256=<hex>"
[$alg, $hex] = explode('=', $sigHeader, 2);
$expected = hash_hmac('sha256', $raw, $secret);
if (!hash_equals($expected, $hex)) {
    return response()->json(['error' => 'invalid_signature'], 401);
}
```

`hash_equals` is the constant-time comparison. **Never** use `===` on signatures.

### 6.2 Idempotency

`mips_payment_id` is UNIQUE in `payment`. The handler:

```php
$payment = Payment::lockForUpdate()->where('mips_payment_id', $evt->payment_id)->first();
if (!$payment) {
    // out-of-order webhook — payment row not yet flushed; re-queue with 1s delay
    return response('retry', 202);
}
if (in_array($payment->status, ['SUCCEEDED','FAILED','REFUNDED'], true)) {
    return response('already_processed', 200);  // idempotent no-op
}
```

### 6.3 Event types

| Event | Action |
|---|---|
| `payment.succeeded` | flip payment to SUCCEEDED, debit ledger, confirm booking, queue notifications |
| `payment.failed` | flip payment to FAILED, mark booking `CANCELLED_FAILED_PAYMENT`, release seat |
| `payment.refunded` | flip payment to REFUNDED, write compensating ledger entry, mark booking `CANCELLED_REFUNDED` |
| `payment.tokenized` | INSERT `card_token` row with `mips_token`, `brand`, `last4`, `exp_*` |

### 6.4 Out-of-order delivery

MIPS may deliver `payment.succeeded` before our `createPayment` response is even persisted (rare but possible on slow disks). We accept this with the 202-retry path above — webhooks are retried by MIPS up to 24h with exponential backoff.

## 7. Reconciliation worker

Runs every 5 minutes, plus a nightly full-settlement reconcile.

### 7.1 5-minute orphan sweep

```sql
SELECT id, mips_payment_id
FROM payment
WHERE status IN ('INITIATED','PENDING')
  AND created_at < NOW() - INTERVAL 10 MINUTE
LIMIT 200;
```

For each, call `GET {base_url}/v1/payments/{mips_payment_id}` and update accordingly. This rescues bookings stranded by lost webhooks.

### 7.2 Nightly settlement reconcile

Pulls the MIPS settlement file for yesterday and joins to local `payment.mips_payment_id`. Three categories:

| Diff | Action |
|---|---|
| In MIPS, not in DB | Alert. Manually investigate — likely a missed webhook for a payment we never `createPayment`'d on our side (impossible by construction; would mean credential leak). |
| In DB SUCCEEDED, not in MIPS | Alert. Possible double-confirmation. Hard stop the payment plane until resolved. |
| Status mismatch | Reconcile DB to MIPS truth, audit log. |

The reconcile report is emailed to the studio owner each morning if any diff > 0.

## 8. Refund / reversal

```php
public function fullRefund(Booking $b, User $actor, string $reason): void
{
    DB::transaction(function () use ($b, $actor, $reason) {
        $payment = Payment::lockForUpdate()
            ->where('booking_id', $b->id)
            ->where('status', 'SUCCEEDED')
            ->firstOrFail();

        $response = $this->mips->refund(
            paymentId: $payment->mips_payment_id,
            amountMinor: $payment->amount_minor,
            reason: $reason,
        );

        $payment->status = 'REFUNDED';
        $payment->refunded_at = now();
        $payment->save();

        // re-credit
        $credit = PackageCredit::lockForUpdate()->findOrFail($b->consumed_credit_id);
        $credit->sessions_used--;
        $credit->save();

        SessionLedgerEntry::create([
            'package_credit_id' => $credit->id,
            'booking_id'        => $b->id,
            'delta'             => +1,
            'reason'            => 'REFUND_RECREDIT',
            'actor_user_id'     => $actor->id,
        ]);

        $b->status = 'CANCELLED_REFUNDED';
        $b->save();

        AuditLog::record('booking.refund', $b, $actor, [...]);
    });
}
```

Partial refund: same shape, smaller `amount_minor`, no re-credit (session was consumed).

## 9. One-tap renewal

Stored `card_token` enables a server-to-server charge without redirect.

```http
POST {base_url}/v1/payments HTTP/1.1
{
  "amount_minor": 200000,
  "currency": "MUR",
  "merchant_reference": "pc_renewal_...",
  "card_token": "tok_xxx",
  "off_session": true
}
```

Response is synchronous: `status: SUCCEEDED | DECLINED`. No webhook needed (still sent for auditing, but UI relies on the sync response).

Failure modes:
- `card_declined` → surface to UI, do not retry.
- `token_expired` → mark `card_token` inactive, prompt user to re-enter card.
- `3ds_required` → fall back to redirect flow (rare, regulatory edge).

## 10. PCI scope

- We never receive, store, or log PAN, CVV, or full track data.
- MIPS hosted page handles entry; we get back an opaque `mips_payment_id` and optionally `mips_token`.
- `raw_payload` JSON is logged after PAN-like substrings are scrubbed. The MIPS responses are designed to omit PAN, but we apply a regex filter as belt-and-braces.
- Our scope: **SAQ A** (redirect / hosted page). Cheapest and smallest scope.

## 11. Testing

- **Mock gateway**: `bin/mock-mips` (Sprint 3) returns deterministic responses with the same shapes. Tests run against this.
- **Sandbox**: nightly contract test hits MIPS sandbox to detect API drift.
- **Production**: smoke test post-deploy issues a 1-cent payment and immediately refunds it.

## 12. Operational alerts

| Alert | Threshold |
|---|---|
| Webhook 5xx rate | > 1% for 5 min |
| `createPayment` p95 latency | > 3s for 10 min |
| Reconciliation diff | > 0 |
| Token charge declined rate | > 10% for 1h |

On reconciliation diff > 0 the **payment plane is hard-stopped** until manual review. The platform falls back to "pay at studio" mode on the booking flow. Better to lose conversions than to risk double-debits.
