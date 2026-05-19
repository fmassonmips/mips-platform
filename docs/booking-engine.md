# Booking Engine

The hot path. This document covers concurrency, seat hold, the ledger, and edge cases. If you change anything in `src/Booking/*` or `src/Ledger/*`, read this first.

## 1. State machine

```
                         ┌──────────────── CANCELLED_FAILED_PAYMENT
                         │
   (create) ──► PENDING ─┴─► CONFIRMED ──► ATTENDED
                  │            │
                  │            ├──► NO_SHOW
                  │            │
                  │            ├──► CANCELLED_BY_CUSTOMER     (free window)
                  │            │
                  │            ├──► CANCELLED_BY_STUDIO
                  │            │
                  │            └──► CANCELLED_REFUNDED
                  │
                  └──► (reaped) → deleted or moved to CANCELLED_FAILED_PAYMENT
```

Transitions are exhaustive: any unknown transition raises and rolls back.

## 2. Seat hold

A `PENDING` booking holds capacity for `hold_ttl_seconds` (default 600). The TTL is stored on the row in `hold_expires_at`, not in Redis — survives an app restart.

### 2.1 Acquisition

```sql
START TRANSACTION;

-- Step 1: lock the class row to serialize concurrent acquirers
SELECT id, capacity
FROM class_instance
WHERE id = :class_id AND status = 'PUBLISHED'
FOR UPDATE;

-- Step 2: count seats currently held
SELECT COUNT(*) AS held
FROM booking
WHERE class_instance_id = :class_id
  AND status IN ('PENDING','CONFIRMED','ATTENDED','NO_SHOW');

-- Step 3: reject if full
IF :held >= :capacity THEN
   ROLLBACK; RAISE BOOKING_FULL;
END IF;

-- Step 4: reject duplicate pending
SELECT 1 FROM booking
WHERE customer_id = :cust AND class_instance_id = :class_id
  AND status IN ('PENDING','CONFIRMED');
IF FOUND THEN ROLLBACK; RAISE ALREADY_BOOKED;
END IF;

-- Step 5: insert
INSERT INTO booking (uuid, customer_id, class_instance_id, status, hold_expires_at)
VALUES (:u, :cust, :class_id, 'PENDING', NOW() + INTERVAL 10 MINUTE);

COMMIT;
```

Why `FOR UPDATE` on `class_instance`? It gives a single mutex per class without bloating Redis or needing a global lock. The lock is held for milliseconds.

### 2.2 TTL reaper

A worker runs every 60 seconds:

```sql
UPDATE booking
SET status = 'CANCELLED_FAILED_PAYMENT'
WHERE status = 'PENDING' AND hold_expires_at < NOW();
```

The seat is implicitly released because subsequent count queries exclude `CANCELLED_*` statuses.

### 2.3 Why not Redis-only?

Considered and rejected. Reasons:
- A Redis crash would lose held seats and overbook on next request.
- Two systems of truth (Redis + DB) means reconciliation forever.
- The 50-RPS peak for one studio is comfortably within InnoDB row-lock throughput.

We use Redis only for transient things: session, rate limits, queue backend.

## 3. Confirmation

Confirmation happens in the MIPS webhook (asynchronously). It is **the only place** in the codebase that flips a booking from `PENDING` → `CONFIRMED`.

```php
// pseudo-code; real code in src/Payment/MipsWebhookHandler.php
DB::transaction(function () use ($evt) {
    $payment = Payment::lockForUpdate()->where('mips_payment_id', $evt->payment_id)->firstOrFail();
    if ($payment->status === 'SUCCEEDED') return;             // idempotent replay
    if ($payment->status !== 'INITIATED' && $payment->status !== 'PENDING') {
        throw new InvalidStateException();
    }

    $payment->status = 'SUCCEEDED';
    $payment->succeeded_at = now();
    $payment->fee_minor = $evt->fee_minor;
    $payment->raw_payload = $evt->raw;
    $payment->save();

    if ($payment->booking_id) {
        $booking = Booking::lockForUpdate()->findOrFail($payment->booking_id);
        if ($booking->status !== 'PENDING') {
            throw new InvalidStateException();                  // hold reaped already
        }

        $credit = $this->ledger->debitOldestActive($booking->customer_id, $booking->id);
        $booking->status = 'CONFIRMED';
        $booking->consumed_credit_id = $credit->id;
        $booking->save();

        $this->notifications->queue($booking->customer_id, 'booking_confirmed', [...]);

        $remaining = $this->ledger->totalRemaining($booking->customer_id);
        if ($remaining === 1) {
            $this->notifications->queue($booking->customer_id, 'low_balance', [...]);
        }
    } elseif ($payment->package_credit_id) {
        // package purchase, no booking; credit row is created in same tx earlier
        $this->notifications->queue($payment->customer_id, 'package_purchased', [...]);
    }
});
```

## 4. The ledger debit

```php
public function debitOldestActive(int $customerId, int $bookingId): PackageCredit
{
    $credit = PackageCredit::query()
        ->where('customer_id', $customerId)
        ->whereRaw('sessions_used < sessions_total')
        ->where('expires_at', '>', now())
        ->orderBy('expires_at', 'asc')
        ->orderBy('id', 'asc')
        ->lockForUpdate()
        ->first();

    if (!$credit) throw new InsufficientCreditException();

    $credit->sessions_used++;
    $credit->save();

    SessionLedgerEntry::create([
        'package_credit_id' => $credit->id,
        'booking_id'        => $bookingId,
        'delta'             => -1,
        'reason'            => 'BOOKING_CONFIRMED',
        'actor_user_id'     => null,
    ]);

    return $credit;
}
```

Invariant: any change to `sessions_used` is paired with a `session_ledger_entry` row in the **same transaction**. The nightly reconciliation job verifies this for every credit.

## 5. Cancellation

```php
public function cancelByCustomer(Booking $b): void
{
    DB::transaction(function () use ($b) {
        if ($b->status !== 'CONFIRMED') throw new InvalidStateException();

        $ci = ClassInstance::findOrFail($b->class_instance_id);
        $hoursUntilClass = now()->diffInHours($ci->starts_at, false);
        $window = $ci->cancel_free_window_h;

        if ($hoursUntilClass < $window) {
            throw new PolicyViolationException("cancel.outside_free_window", $window);
        }

        // re-credit the same package_credit
        $credit = PackageCredit::lockForUpdate()->findOrFail($b->consumed_credit_id);
        $credit->sessions_used--;
        $credit->save();

        SessionLedgerEntry::create([
            'package_credit_id' => $credit->id,
            'booking_id'        => $b->id,
            'delta'             => +1,
            'reason'            => 'BOOKING_CANCELLED_FREE',
            'actor_user_id'     => null,
        ]);

        $b->status = 'CANCELLED_BY_CUSTOMER';
        $b->save();
    });
}
```

If the cancellation happens **outside** the free window, no ledger movement, no refund, status flips to `CANCELLED_BY_CUSTOMER` with a `consumed_no_refund` flag in the audit log.

## 6. Studio-side cancellation (class cancelled)

```php
public function cancelClassByStudio(ClassInstance $ci, User $actor): void
{
    DB::transaction(function () use ($ci, $actor) {
        $bookings = Booking::where('class_instance_id', $ci->id)
            ->whereIn('status', ['PENDING','CONFIRMED'])
            ->lockForUpdate()->get();

        foreach ($bookings as $b) {
            if ($b->status === 'CONFIRMED') {
                $this->refunds->fullRefund($b, $actor, reason: 'class_cancelled');
            } else {
                $b->status = 'CANCELLED_FAILED_PAYMENT';
                $b->save();
            }
            $this->notifications->queue($b->customer_id, 'studio_cancelled', [...]);
        }
        $ci->status = 'CANCELLED';
        $ci->save();
    });
}
```

## 7. No-show handling

End-of-day worker (runs at midnight per studio TZ):

```sql
UPDATE booking
SET status = 'NO_SHOW'
WHERE status = 'CONFIRMED'
  AND class_instance_id IN (
      SELECT id FROM class_instance
      WHERE ends_at < NOW() - INTERVAL 1 HOUR
  );
```

`NO_SHOW` consumes the session (already debited at confirmation). No additional ledger movement. Configurable in Phase 2 to also charge a fee.

## 8. Concurrency tests (must exist before merge)

```php
// tests/Integration/ConcurrencyTest.php
public function test_no_overbooking_under_concurrent_load(): void
{
    $class = ClassInstance::factory()->create(['capacity' => 1]);
    $results = $this->parallelCalls(50, fn() => $this->postBooking($class));
    $successes = array_filter($results, fn($r) => $r->status === 201);
    $this->assertCount(1, $successes);
    $full = array_filter($results, fn($r) => $r->code === 'BOOKING_FULL');
    $this->assertCount(49, $full);
}
```

This test must run on every CI build for the `Booking` module.

## 9. Edge cases checklist

| Case | Handling |
|---|---|
| Two simultaneous reservations on the last mat | One wins via row lock, the other sees `BOOKING_FULL` (HTTP 409). |
| Webhook arrives twice | `payment.status === 'SUCCEEDED'` short-circuit returns 200. |
| Payment succeeds but app crashes before commit | DB transaction rolls back; reconciliation worker picks up the stranded payment and re-runs confirmation. |
| Customer pays then class is cancelled by studio | Full refund via MIPS reversal + `studio_cancelled` notification. |
| Customer cancels exactly at the window boundary | Server-side `now()` decides; client-side countdown is informational only. |
| Package expires mid-flow | Caught at `debitOldestActive`; surfaces `INSUFFICIENT_CREDIT`. UI offers inline package purchase. |
| Customer holds two devices, both at "Reserve" | Partial unique index `(customer_id, class_instance_id) WHERE status='PENDING'` rejects the second. |
| Capacity reduced below current bookings | API validation rejects with 422 before any DB change. |
| Refund larger than the original payment | DB CHECK constraint blocks. App validates first with a clearer error. |
| Manual cash payment | `payment.method='CASH'`, no MIPS call. Counts toward revenue, flagged for reconciliation. |

## 10. Performance budget

For a single studio at MVP scale (≤ 400 active customers):
- Booking create: < 100 ms p95.
- Webhook handle: < 200 ms p95.
- Confirmation → notification queued: < 5 s p95 (driven by worker poll).

Anything above these → open an issue, do not just bump alert thresholds.
