# Glossary

Domain vocabulary used across the platform, the code, and the docs.

| Term | Definition |
|---|---|
| **Audit log** | Append-only `audit_log` row created in the same transaction as any money or credit change. |
| **Booking** | A customer's reservation for a single `class_instance`. Goes through `PENDING → CONFIRMED → ATTENDED/NO_SHOW` or various `CANCELLED_*` states. |
| **Cancellation free window** | Hours before class start during which a customer can cancel and reclaim the session. Per-studio config (`cancel_free_window_h`, default 12). |
| **Card token** | An opaque MIPS-side identifier for a saved card. Enables one-tap renewal. Never contains PAN. |
| **Class instance** | A concrete scheduled class (e.g. *Pilates Mat Beginner — Tue 18:30, Studio A*). Distinct from `class_type` (template). |
| **Class type** | A template (e.g. *Pilates Mat Beginner*) reused across many instances. |
| **Comp** | A complimentary credit issued by the studio. Costs the customer nothing. Counted separately in revenue reports. |
| **Cutoff** | Minutes before class start after which bookings are closed. Default 15. |
| **Customer** | An end-user with `customer` identity. Logs in with phone OTP or email magic link. Distinct from staff (`users`). |
| **Drop-in** | A single-class purchase. Modeled as a 1-session package — same primitive as multi-session packs. |
| **Hold TTL** | Seconds a `PENDING` booking holds capacity before being reaped. Default 600. |
| **Idempotency key** | Header `Idempotency-Key` on POST/PATCH; server replays response for repeated keys within 24h. |
| **Juice** | MCB Juice mobile wallet (Mauritius). Dominant local payment method. |
| **Ledger** | The append-only `session_ledger_entry` table. The source of truth for package balances. |
| **Low-balance trigger** | Automated SMS + email sent when a customer's total remaining sessions equals 1. The core retention loop. |
| **Mat** | One unit of capacity in a Pilates class. |
| **MIPS** | Mauritius IPS payment gateway. Handles card + Juice + tokenization + reversal. |
| **Minor units** | Integer representation of money. 1 MUR = 100 minor units. Always integers; never floats. |
| **MUR** | Mauritian rupee currency code. |
| **No-show** | A confirmed booking where the customer didn't attend. Session is consumed; no refund. |
| **OTP** | One-time password sent via SMS to authenticate a customer. 6 digits, 5-minute TTL. |
| **Outbox** | The `notification` table. Producers insert rows; workers send. Single point of truth for all messages. |
| **Package** | A catalog item defining `sessions_total`, `validity_days`, `price_minor`. Bought by customers. |
| **Package credit** | A specific instance of a purchased package, owned by a customer, tracked in `package_credit`. |
| **PAN** | Primary Account Number (the digits on a card). **Never** stored, processed, or transmitted by this platform. |
| **PWA** | Progressive Web App — the customer-facing mobile web app with offline support. |
| **Reconciliation** | Daily diff of our `payment` rows vs the MIPS settlement file. Non-zero diff = incident. |
| **Renewal** | A new package purchase by an existing customer, often triggered by the low-balance message. |
| **Reversal** | A MIPS-side refund. Returns money to the customer's original payment method. |
| **Seat hold** | A `PENDING` booking that occupies a mat for `hold_ttl_seconds` while the customer pays. |
| **Session** | One attendance unit. Consumed when a confirmed booking is created (or when a no-show occurs). |
| **Status engine** | The nightly job that computes `customer.status` (`ACTIVE` / `INACTIVE` / `LOW_BALANCE` / `EXPIRED`). |
| **Studio** | A tenant on the platform — one boutique fitness business. |
| **Tokenization** | Replacing card details with an opaque token. Done by MIPS, returned to us as `mips_token`. |
| **Webhook** | Asynchronous HTTP callback from MIPS to `/api/v1/webhooks/mips`. HMAC-signed, idempotent. |
