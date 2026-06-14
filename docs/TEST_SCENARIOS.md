# Test Scenarios

Covers what exists (auth, routing engine, providers, domain helpers — runnable
today) and the end-to-end scenarios the next phases must satisfy.

## A. Runnable today

### A1 — Routing resolves each payment type
- BANK_TRANSFER, QR, PAYMENT_LINK, VIRTUAL_CREDENTIAL → `passpass`
- PAYPUMP_TRANSFER → `paypump`; WORKFLOW → `inflow`; CARD → `cardrail`
- Expect: `PaymentRouter::table()` returns the mapping above, no `UNROUTABLE`.

### A2 — PassPass create payment stamps regulated fields
- `createPayment(BANK_TRANSFER, 150050 MUR)` →
  `success=true`, `status=PROCESSING`, `raw.regulated_entity=PassPass`,
  non-empty `raw.regulated_transaction_id`.

### A3 — Card stub decline rule
- `amount_minor % 100 == 13` → `success=false`, `errorCode=do_not_honor`.
- Any other amount → `status=PROCESSING`, **no PAN stored** (`pan_stored=false`).

### A4 — Money is integer-safe
- `Money::toMinor("1500.50") == 150050`; `Money::format(150050) == "1,500.50"`.

### A5 — State machine guards transitions
- `CREATED → PROCESSING` allowed; `PAID → CREATED` rejected; `REFUNDED` terminal.

### A6 — RBAC deny-by-default
- `compliance_officer` can `merchant.approve`; `merchant` cannot.
- `super_admin` can do anything; unknown role → consumer grants only.

### A7 — Webhook signature verification
- Live mode + wrong/absent signature → `verified=false`.
- Correct HMAC-SHA256 of body with secret → `verified=true`.

> Repro of A1–A6 (sandbox, no DB needed):
> ```bash
> php -r '$GLOBALS["config"]=require "config/config.php";
> spl_autoload_register(fn($c)=>is_file($f="src/".str_replace("\\","/",substr($c,4)).".php")&&require $f);
> print_r(App\Routing\PaymentRouter::fromGlobalConfig()->table());'
> ```

## B. End-to-end (next phases)

### B1 — Merchant onboarding → approval
1. Register user, create merchant → `kyc_status=DRAFT`, `compliance_status=PENDING`.
2. Submit KYC + docs → `SUBMITTED`.
3. Compliance officer (PassPass) approves → `kyc_status=APPROVED`, `compliance_status=CLEARED`.
4. Non-compliance role attempting approval → `403`.

### B2 — Pay by Bank happy path
1. Approved merchant; consumer initiates BANK_TRANSFER.
2. Transaction `CREATED → PROCESSING`; routed to `passpass`.
3. Webhook `PAID` (HMAC valid) → `PROCESSING → PAID`; `transaction_events` row written.
4. Fee computed from `fee_rules` (1.00%); `net_minor = amount - fee`.

### B3 — Settlement
1. Paid transactions grouped into a `settlement_batch` (supervised by PassPass).
2. `createSettlement` → settlement `SETTLED`; transactions `PAID → SETTLED`.

### B4 — Reconciliation exceptions
- Missing settlement → `MISSING_SETTLEMENT`.
- Duplicate provider ref → `DUPLICATE_SETTLEMENT`.
- Amount differs from bank file → `AMOUNT_MISMATCH`.
- Reference differs → `REFERENCE_MISMATCH`.

### B5 — Idempotency
- Two payment creations with the same `Idempotency-Key` create exactly one
  transaction (unique `idempotency_key`).

### B6 — Refund / cancel
- `PAID → REFUNDED` via `refundPayment`; `PROCESSING → CANCELLED` via `cancelPayment`.

### B7 — Negative / security
- SQL injection attempts blocked by prepared statements.
- CSRF-less POST → `419`; rate limit exceeded → `429`.
- Suspended merchant cannot transact (`compliance_status != CLEARED`).
