# MIPS Booking & Payment Engine for Boutique Fitness Studios

**Vertical MVP — Pilates pilot**
**Positioning:** *Book → Pay → Consume → Return.* A payment-first booking and retention engine, not a generic calendar tool.

---

## 1. Product Vision

Boutique Pilates studios in Mauritius lose revenue between two moments: when a class is published and when a customer rebooks. The gap is filled today by WhatsApp messages, paper punch cards, and bank transfers that get reconciled by hand. Each step leaks money, attention, and trust.

The MIPS Booking & Payment Engine collapses that gap into a single, payment-native flow. The studio publishes a class, the customer reserves a mat, MIPS captures the money instantly (Juice or card), the system decrements the package balance, and when the balance approaches zero the engine triggers the next sale automatically. Booking, payment, and retention live in the same primitive — not three integrations bolted together.

**One-line vision:** *Every reservation is a paid reservation; every package is a self-renewing one.*

**Strategic wedge:** payments are the moat. Generic booking SaaS treats payment as a Stripe checkbox. We make MIPS — Juice + local card rails — a first-class object: every booking is a settled MIPS transaction, every refund is a MIPS reversal, every renewal is a one-tap MIPS re-charge.

---

## 2. Target Customer

**Primary (pilot, 0–12 months):**
- Boutique Pilates studios in Mauritius (Curepipe, Grand Baie, Tamarin, Moka, Port-Louis).
- 1–3 instructors, 1–2 studio rooms, 6–14 mats per class.
- 80–400 active customers.
- Already using WhatsApp + Excel + bank transfer / Juice peer-to-peer.
- Pain: no-shows, manual reconciliation, lost package balances, no rebooking signal.

**Secondary (Phase 2, 12–24 months):**
- Yoga studios, barre studios, small CrossFit boxes, dance schools, boutique HIIT studios.
- Same operating shape: mat/spot inventory + package economics + recurring customers.

**Non-target (explicit):**
- Large multi-site gyms with turnstile access.
- Personal trainers without fixed inventory.
- Spa / wellness with variable-duration services (different inventory model).

---

## 3. User Personas

### Persona A — Léa, Studio Owner-Operator
- 34, runs a 12-mat Pilates studio, also teaches 60% of classes.
- Phone is her POS, her CRM, and her marketing engine.
- KPIs she actually cares about: filled-mat ratio, package renewals/month, no-show rate.
- Hates: chasing payments, manual punch cards, MyT/MCB statement reconciliation.
- Wants: "I publish the week on Sunday night, I forget about it until Monday class."

### Persona B — Priya, Regular Customer
- 29, office worker, 2 sessions/week, holds a 10-session package.
- Books from her phone during lunch.
- Pays with **MCB Juice** (her default) — falls back to Visa debit card.
- Wants instant confirmation; will not chase a studio for a receipt.

### Persona C — Karim, Drop-in Customer
- 41, tourist or trial customer, no package.
- Books a single class; pays per class.
- Conversion funnel target: turn him into a 5-session pack within 2 visits.

### Persona D — Anaïs, Front-desk / Assistant Instructor
- 22, opens the studio, checks people in, helps with no-shows.
- Needs a one-screen check-in view; no admin power beyond marking attendance.

---

## 4. User Journeys

### J1 — First-time customer, single class
1. Lands on studio link (Instagram bio / WhatsApp).
2. Sees week calendar → picks Tuesday 18:30 class.
3. Sees `4 mats left of 12`.
4. Taps **Reserve**.
5. Account quick-create (name, email, phone — phone is the identity key in MU).
6. Chooses **Single class — MUR 450** or **5-pack — MUR 2,000**.
7. Pays via MIPS → Juice push (or card).
8. Receives SMS + email: *"Confirmé — mardi 18:30, mat #7"*.
9. 2h before class: reminder SMS.
10. After class: instructor marks attended → balance updates.

### J2 — Returning package holder
1. Opens calendar (logged in via magic link / phone OTP).
2. Sees `Solde: 3 / 10 sessions`.
3. Books → no payment screen, balance decrements on confirmation.
4. Attends class.
5. Balance reaches 1 → automated *"Il te reste 1 session"* SMS + email with one-tap renewal link.
6. Taps link → MIPS one-tap re-charge (saved card token / Juice alias) → package renewed.

### J3 — No-show / Late cancel
1. Customer doesn't show OR cancels < 4h before class.
2. System auto-decrements 1 session (rule configurable per studio).
3. Customer receives transparent notification of consumption + policy reminder.

### J4 — Studio owner Sunday-night publishing
1. Léa opens admin → **Schedule** → clones last week.
2. Adjusts capacity / instructor for 2 classes.
3. Publishes → customers see new week immediately.
4. Léa moves on with her life.

### J5 — Refund / dispute
1. Customer requests refund within studio policy window.
2. Léa opens booking → **Refund** → choose full / partial / credit-to-package.
3. MIPS reversal triggered; balance & ledger updated atomically.

---

## 5. MVP Scope (Phase 1 — in)

| # | Capability | Definition of done |
|---|---|---|
| 1 | Weekly class calendar (public) | Customer sees published classes, capacity, remaining mats |
| 2 | Mat reservation | Atomic seat hold + commit; no over-booking under race |
| 3 | MIPS payment — card + Juice | Single integration, settlement webhook reconciled to booking |
| 4 | Package purchase & balance ledger | N sessions, expiry date, per-session debit |
| 5 | Customer profile + history | Bookings, payments, balance, status |
| 6 | Customer status engine | active / inactive / low-balance / expired |
| 7 | Automated low-balance notification | SMS + email at balance = 1, one-tap renewal link |
| 8 | Pre-class reminder | T-24h email, T-2h SMS |
| 9 | Admin dashboard — schedule, attendance, customers, revenue | Léa can run the studio without spreadsheets |
| 10 | Refund flow | MIPS reversal + ledger correction |
| 11 | Attendance check-in (Anaïs view) | Tablet-friendly one-screen list |

## 6. Out of Scope (Phase 1 — explicit)

- Multi-studio / franchise consolidation.
- Instructor payroll, commissions, scheduling-as-HR.
- Inventory of physical goods (retail).
- Membership subscriptions with auto-renew billing (Phase 2).
- Waitlist auto-promotion (Phase 2 — keep manual waitlist for now).
- Multi-currency. Currency is **MUR** only.
- Native mobile app. **Mobile web (PWA) only.**
- Loyalty points, referral programs.
- In-app chat with studio.
- Class video streaming / on-demand.
- Public API for third parties.
- Advanced marketing automation (segments, campaigns, A/B). One rule only: low-balance trigger.

---

## 7. Functional Requirements

### 7.1 Authentication
- FR-A1: Customer signs up with **phone number + name + email** (phone is unique identity).
- FR-A2: Login via **OTP SMS** OR **magic link email**. No passwords for customers.
- FR-A3: Studio staff login via email + password (existing `users` table) + role (`owner`, `instructor`, `frontdesk`).
- FR-A4: Session timeout: 30 days for customers, 12 hours for staff.

### 7.2 Catalog
- FR-C1: Studio defines **class types** (e.g. *Pilates Mat Beginner*, *Pilates Mat Advanced*).
- FR-C2: Studio defines **packages** (1, 5, 10, 20 sessions; price; validity in days).
- FR-C3: Studio publishes **class instances** with date, time, duration, room, instructor, capacity (mat count), class-type FK.

### 7.3 Booking
- FR-B1: Customer can book a class instance if `remaining_capacity > 0` AND `start_time > now + cutoff_minutes` (default 15).
- FR-B2: A booking is **PENDING** until payment success, then **CONFIRMED**.
- FR-B3: PENDING bookings hold a seat for **10 minutes** then auto-release.
- FR-B4: A customer cannot hold more than 1 PENDING booking for the same class.
- FR-B5: Cancellation rules (per studio config):
  - `> cancel_free_window_h` (default 12h): full credit back to package OR refund.
  - `<= cancel_free_window_h`: session consumed, no refund.
- FR-B6: A confirmed booking can be checked in only by staff, only on the day of the class.

### 7.4 Payment (MIPS)
- FR-P1: Two payment methods exposed: **MCB Juice** and **Card (Visa/Mastercard via MIPS)**.
- FR-P2: One booking = one payment intent.
- FR-P3: Payment confirmation is **idempotent**: webhook can replay without double-confirming.
- FR-P4: Card tokenization stored (MIPS-side token only; never PAN). Token enables one-tap renewal.
- FR-P5: Refund initiates a MIPS reversal; partial refunds allowed for package purchases.
- FR-P6: All money figures stored as **integer minor units (cents of MUR)** — never floats.

### 7.5 Package balance
- FR-K1: Buying a package creates a **package_credit** with `sessions_total`, `sessions_used = 0`, `expires_at`.
- FR-K2: Each confirmed booking debits **1 session** from the customer's oldest non-expired, non-empty package.
- FR-K3: Single-class purchases are modelled as a **1-session package** (uniform model — see §11).
- FR-K4: Cancellation within free window **re-credits** the session to the same package.
- FR-K5: Expired sessions are non-refundable, non-transferable.

### 7.6 Notifications
- FR-N1: Booking confirmation: email + SMS within 60s of payment success.
- FR-N2: Pre-class reminder: SMS at T-2h, email at T-24h.
- FR-N3: **Low-balance trigger** (the core retention loop):
  - Fires when, after a confirmed booking, `sum(remaining_sessions across active packages) == 1`.
  - Sends SMS **and** email.
  - Body (FR): *"Il te reste 1 session sur ton forfait. Clique ici pour réserver ton prochain cours avant qu'il ne soit complet."*
  - Body (EN): *"You have 1 session left. Tap here to book your next class before it fills up."*
  - Contains a deep link to renew package with **one-tap MIPS re-charge** if a saved token exists.
- FR-N4: Expiry warning: at T-7 days before package expires with `remaining > 0`.
- FR-N5: All outgoing messages logged in `notifications` table with delivery status.

### 7.7 Admin (Léa's dashboard)
- FR-D1: **Today view**: classes today, fill rate, expected revenue, no-shows.
- FR-D2: **Schedule editor**: clone-week, bulk publish, edit single class, cancel class (auto-refund all).
- FR-D3: **Customer list**: filterable by status (active / inactive / low-balance / expired), CSV export.
- FR-D4: **Customer profile**: history, balances, manual credit adjustment (audit-logged).
- FR-D5: **Revenue view**: daily / weekly / monthly, payments vs refunds, gross vs net of MIPS fees.
- FR-D6: **Attendance view**: per-class list, tap to mark present / absent.
- FR-D7: **Settings**: studio details, packages, cancellation policy, notification toggles.

---

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Latency**: booking confirmation page < 2s p95 from payment success. |
| NFR-2 | **Availability**: 99.5% monthly; class times are commercial peaks. |
| NFR-3 | **Concurrency**: must safely handle 50 concurrent bookings on the same class without overbooking. Tested via stress harness. |
| NFR-4 | **Data residency**: customer + payment metadata stored in Mauritius region or EU. PCI scope minimized — no PAN ever stored. |
| NFR-5 | **Idempotency**: every state-changing endpoint accepts `Idempotency-Key` header. |
| NFR-6 | **Auditability**: every credit adjustment, refund, and admin override writes to immutable `audit_log`. |
| NFR-7 | **Mobile**: customer flow must work on a 3G connection on Android Chrome at 320px width. |
| NFR-8 | **i18n**: FR + EN at launch (Mauritius bilingual). Strings externalized day-1. |
| NFR-9 | **Security**: OWASP top-10 baseline; CSRF on all forms; rate-limit OTP (5/hr/phone); session cookies `Secure`, `HttpOnly`, `SameSite=Lax`. |
| NFR-10 | **Backups**: nightly DB snapshot, 30-day retention, quarterly restore drill. |
| NFR-11 | **Time**: all timestamps stored UTC, displayed in `Indian/Mauritius` (UTC+4). |

---

## 9. Data Model (conceptual)

```
Studio 1───* Room
Studio 1───* ClassType
Studio 1───* Instructor
Studio 1───* Package (catalog)

ClassType 1───* ClassInstance ───* Booking
Room       1───* ClassInstance
Instructor 1───* ClassInstance

Customer 1───* Booking
Customer 1───* PackageCredit ───* SessionLedgerEntry
Customer 1───* Payment
Customer 1───* CardToken (MIPS)

Booking 1──1 Payment (intent)
Booking 1──? SessionLedgerEntry  (debit on confirm, credit on free-cancel)

Notification ──* (customer, channel, template, payload, status)
AuditLog     ──* (actor, action, target, before, after, ts)
```

Key invariants:
- A `Booking` is `CONFIRMED` iff exactly one `Payment` row is `SUCCEEDED` for it AND exactly one `SessionLedgerEntry` of type `DEBIT` exists referencing it.
- `sum(SessionLedgerEntry.delta) over a PackageCredit` ∈ `[-sessions_total, 0]`.
- A `ClassInstance.remaining_capacity` is derived: `capacity - count(bookings WHERE status IN (PENDING, CONFIRMED, ATTENDED, NO_SHOW))`. Never stored as a mutable column.

---

## 10. Booking Rules (precise)

1. **Cutoff**: bookings close `cutoff_minutes` before class start (default 15).
2. **Capacity hold**: PENDING booking holds a seat for `hold_ttl_seconds` (default 600). On TTL or payment failure, seat released atomically.
3. **One pending per customer per class**: enforced by partial unique index `(customer_id, class_instance_id) WHERE status = 'PENDING'`.
4. **Concurrency**: seat acquisition uses a transaction:
   ```
   BEGIN;
   SELECT capacity FROM class_instance WHERE id = ? FOR UPDATE;
   SELECT COUNT(*) FROM booking WHERE class_instance_id = ? AND status IN (...);
   IF count < capacity THEN INSERT booking PENDING;
   COMMIT;
   ```
   (Postgres advisory lock or row lock; MariaDB `SELECT ... FOR UPDATE`.)
5. **Cancellation window**: studio-configurable (`cancel_free_window_h`). Outside window → session is consumed.
6. **No double-debit**: ledger debit and booking status transition are in the same DB transaction.
7. **Manual override**: only `owner` role can force-confirm a booking without payment (e.g. comp class). Always audit-logged.

---

## 11. Session / Package Consumption Logic

Single uniform model. Drop-in and package are the **same primitive**.

- Every purchase creates a `package_credit` row.
- Single class = `sessions_total = 1, expires_at = class_start + 1 day`.
- 5-pack = `sessions_total = 5, expires_at = purchase + 60 days` (studio-configurable).
- Booking confirmation runs:
  ```
  pick oldest package_credit WHERE customer_id = ?
                                AND sessions_used < sessions_total
                                AND expires_at > now
  ORDER BY expires_at ASC
  FOR UPDATE
  -> insert session_ledger_entry (package_credit_id, booking_id, delta = -1, reason = 'BOOKING_CONFIRMED')
  -> sessions_used += 1
  ```
- Free cancellation runs the inverse: `delta = +1, reason = 'BOOKING_CANCELLED_FREE'`.
- No-show: same as confirmed (session consumed). Studio-configurable.
- Expired credits never re-credit; they age out.

This gives one consumption engine that handles drop-ins, packs, comps, and refunds uniformly. Reports just GROUP BY `reason`.

---

## 12. Payment Flow (MIPS)

```
Customer → Web
  POST /bookings { class_instance_id, package_choice }
     ↓ (hold seat, status=PENDING)
  POST /payments/intent
     → MIPS createPayment(amount_minor, currency=MUR,
                           method=JUICE|CARD, reference=booking_id,
                           callback_url=/webhooks/mips,
                           return_url=/bookings/:id/return)
     ← redirect_url
  302 → MIPS hosted page (Juice push / 3DS card)
     ↓
  MIPS → POST /webhooks/mips  (signed payload)
     verify HMAC, idempotency on payment_id
     IF success:
        BEGIN
          mark Payment SUCCEEDED
          debit package_credit (consume 1 session)
          mark Booking CONFIRMED
          emit notification.booking_confirmed
          IF remaining_total_sessions == 1:
             emit notification.low_balance
        COMMIT
     ELSE:
        mark Payment FAILED
        release seat (Booking PENDING → CANCELLED_FAILED_PAYMENT)
Customer ← /bookings/:id/return
  poll booking status (max 5s, exponential backoff) — webhook is source of truth
```

Failure modes handled:
- Webhook arrives before user returns → return page reads DB, shows success.
- User abandons MIPS hosted page → seat auto-releases at TTL.
- Duplicate webhook → idempotency on `mips_payment_id`.
- Webhook lost → reconciliation job polls MIPS `getPaymentStatus` for PENDING > 10 min.

Refund flow:
```
Admin → POST /bookings/:id/refund { mode: FULL|PARTIAL|CREDIT }
  IF CREDIT: re-credit package_credit only, no MIPS call.
  ELSE: MIPS reverseTransaction(payment_id, amount_minor)
  on success: payment row → REFUNDED, ledger compensating entry, booking → CANCELLED_REFUNDED.
```

---

## 13. Notification Rules

| Event | Channel | Timing | Template key |
|---|---|---|---|
| Booking confirmed | Email + SMS | within 60s | `booking_confirmed.{fr,en}` |
| Pre-class | Email | T-24h | `class_reminder_24h.{fr,en}` |
| Pre-class | SMS | T-2h | `class_reminder_2h.{fr,en}` |
| Low balance (= 1 left) | Email + SMS | on confirmation transition | `low_balance.{fr,en}` |
| Package expiring | Email | T-7d if remaining > 0 | `expiring_soon.{fr,en}` |
| Booking cancelled by studio | Email + SMS | immediate | `studio_cancelled.{fr,en}` |
| Refund issued | Email | immediate | `refund_issued.{fr,en}` |

Rules:
- Every send writes a `notifications` row before the API call (outbox pattern).
- A background worker drains the outbox; failures retry 3× with exponential backoff.
- Hard-bounce SMS or email marks `customer.contactable_*` false; surfaces in admin.
- Localization key resolved from `customer.locale` (default `fr-MU`).
- Studio can mute non-transactional reminders per-customer (GDPR-style preference).

---

## 14. Admin Dashboard Requirements

### Layout
- Left nav: **Today**, **Schedule**, **Customers**, **Revenue**, **Settings**.
- Top bar: studio switcher (Phase 2), date picker, search (customer name / phone).

### Screens

**14.1 Today** — single most-used screen.
- Class cards (chronological): time, instructor, room, fill ratio `9/12`, **Check-in** button.
- Side panel: today's revenue, today's no-shows, today's refunds.
- One-click drill into per-class attendance.

**14.2 Schedule**
- Week grid (Mon–Sun × time slots).
- Click slot → create class. Click existing → edit / cancel.
- "Clone last week" button.
- Bulk-publish toggle (draft vs published).

**14.3 Customers**
- Table: name, phone, status chip, balance, last seen, lifetime value.
- Filters: status, low-balance, expired, no-package, segment.
- Row click → customer profile.

**14.4 Customer profile**
- Header: contact, status, balances per package, lifetime stats.
- Tabs: **Bookings**, **Payments**, **Notifications sent**, **Manual adjustments**.
- Actions: add manual credit, mark contactable/no, comp a class (audit-logged).

**14.5 Revenue**
- Stacked bar: card vs Juice vs comp.
- Daily / weekly / monthly.
- MIPS fees deducted to show **net**.
- Refunds shown as negative bars.
- CSV export.

**14.6 Settings**
- Studio info, logo, public URL handle.
- Class types and packages (CRUD).
- Cancellation policy (`cancel_free_window_h`, `cutoff_minutes`).
- Notification on/off per template.
- MIPS credentials (per-studio merchant ID).

---

## 15. Customer-Facing Screens

1. **Landing / studio page** — hero, this-week calendar, "Book now" CTA.
2. **Calendar** — week view, filter by class type, capacity chip per slot.
3. **Class details** — title, instructor, mat count, "Reserve" button.
4. **Auth gate** — phone + name + email + OTP (modal, not page jump).
5. **Choose purchase** — single class vs package (if no balance) OR "use 1 session from your 10-pack" (if balance).
6. **Payment** — MIPS hosted page (Juice / Card tab).
7. **Confirmation** — mat number, calendar add-to-calendar (.ics), share with friend.
8. **My bookings** — upcoming + past, with cancel (subject to policy).
9. **My packages** — balances, expiry, **Renew** one-tap CTA.
10. **Account** — name, phone, email, locale, notification preferences, saved card chip ("Visa •••• 4242 — remove").

Constraints: every screen must be reachable in ≤ 3 taps from the landing page. PWA installable. Offline: read-only cache of "My bookings".

---

## 16. Edge Cases

1. **Race on last mat**: two customers tap Reserve simultaneously → row-lock + capacity recount; the loser sees "Sorry, class just filled" before payment.
2. **Payment success but webhook never arrives**: reconciliation job catches it within 5 min and confirms.
3. **Webhook arrives twice**: idempotency key on `mips_payment_id` no-ops the second.
4. **Customer pays, studio cancels class**: auto-refund to original method (MIPS reversal) + apology SMS.
5. **Package expires mid-booking flow**: catch at confirmation; offer to buy a new pack inline.
6. **Customer cancels exactly at the boundary of the free window**: server-side `now()` is authoritative.
7. **No-show then they show up late**: instructor can mark "attended late" (still consumes 1, no extra debit).
8. **Manual cash payment** (drop-in walk-in): owner records as `payment.method = CASH`, no MIPS call; counts toward revenue, flagged separately.
9. **Refund a partially-consumed pack**: refund prorated to unused sessions only; consumed sessions are not refundable.
10. **Customer changes phone number**: phone is identity; migration flow requires OTP on both old + new.
11. **Daylight-savings / public holiday**: Mauritius has no DST, but rule engine must still handle TZ correctly for any future expansion.
12. **MIPS down**: graceful degradation — booking falls back to "Reserve, pay at studio" with admin opt-in; flagged on dashboard.
13. **Class capacity reduced after bookings exist**: system blocks reduction below current bookings; owner must cancel specific bookings first.
14. **Customer books for a friend**: out of scope MVP. Each booking ties to the paying customer's identity.
15. **Refund larger than original payment** (e.g. due to retries): hard-blocked at API and DB CHECK constraint.

---

## 17. Risk Areas

| Risk | Impact | Mitigation |
|---|---|---|
| **MIPS integration drift** (API or webhook signature changes) | Booking pipeline breaks | Versioned client, contract tests, sandbox env hit nightly |
| **Over-booking under load** | Customer-facing fiasco | Row-lock + integration test that fires N concurrent bookings |
| **SMS deliverability** (MU operators) | Retention loop fails silently | Multi-provider abstraction (Twilio + local aggregator fallback), delivery receipts, daily delivery-rate alert |
| **PCI scope creep** | Compliance burden | Never receive PAN; redirect/hosted-page model only; tokenization via MIPS |
| **GDPR-style data requests** | Owner liability | Self-serve "export my data" + "delete my account" endpoints from day one |
| **Studio mis-configures cancellation policy** | Customer disputes | Sensible defaults; policy snapshot stored on each booking |
| **Reconciliation drift** between DB and MIPS settlement | Owner mistrust | Nightly reconciliation report with diff highlighted |
| **Notification fatigue** | Unsubscribes | Hard cap: ≤ 3 messages per booking, ≤ 1 retention message per 7d |
| **Single-region hosting outage** | Downtime in peak hours | Two AZs minimum; read replica; documented manual-mode runbook |
| **Owner abandons digital tool, reverts to WhatsApp** | Churn | Onboarding success metric: 5 bookings via tool in first 2 weeks; CSM check-in |

---

## 18. Suggested Technology Stack

The existing repo is **PHP 8 + MariaDB** with a hand-rolled auth/session layer. The MVP should extend that stack rather than rewrite — the team is already productive on it and the volumes are tiny.

**Backend**
- PHP 8.2, FPM behind Nginx.
- Slim 4 or Laravel 11 for routing/controllers (recommend **Laravel 11** for queue, scheduler, mail, broadcasting out-of-box — saves weeks).
- MariaDB 10.11 (already in use) for OLTP.
- Redis for: session, rate limiting, seat-hold TTLs, queue backend.

**Frontend (customer)**
- PWA: **Vite + React + TypeScript**, Tailwind CSS, react-query.
- Single SPA bundle, lazy-routed.
- Service worker for offline "My bookings".

**Frontend (admin)**
- Same stack as customer, separate route prefix `/studio/*`, role-gated.

**Integrations**
- **MIPS** (Mauritius IPS) — hosted-payment-page + webhook + tokenization + reversal.
- **SMS**: primary local aggregator (Rogers Capital / Emtel API / local), fallback Twilio.
- **Email**: Postmark or AWS SES (transactional template engine).
- **Calendar**: emit .ics on confirmation, no Google/Outlook OAuth in MVP.

**Infra**
- Hosted on a Mauritius-region VPS (or AWS af-south-1 / eu-west-3) — 2× app nodes behind a managed LB, 1× DB primary + 1 replica, 1× Redis.
- TLS via Let's Encrypt.
- CI/CD: GitHub Actions → deploy via SSH/rsync or Docker Compose.

**Observability**
- Sentry (errors), simple Prometheus + Grafana (or Better Stack) for uptime + RED metrics on booking/payment endpoints.
- Structured JSON logs to stdout, shipped to Loki / Logtail.

**Why not Stripe / Mollie / new shiny stack?**
The wedge is **MIPS-native, MUR-native, Juice-native**. International stacks make Juice second-class. Anything we save in dev time we lose at conversion.

---

## 19. API Structure

Versioned under `/api/v1`. JSON. Bearer tokens (customer = magic-link/OTP-issued JWT; staff = session cookie). All write endpoints accept `Idempotency-Key`.

### Public (customer)
```
POST   /api/v1/auth/otp/request          {phone}
POST   /api/v1/auth/otp/verify           {phone, code} → JWT
POST   /api/v1/auth/magic/request        {email}
GET    /api/v1/auth/magic/verify?token=  → JWT
GET    /api/v1/me                        → profile + balances
PATCH  /api/v1/me                        {name, email, locale, prefs}

GET    /api/v1/studios/:handle            → studio public info
GET    /api/v1/studios/:handle/classes    ?from=&to=
GET    /api/v1/classes/:id                → class detail + remaining

POST   /api/v1/bookings                   {class_instance_id, package_choice}
                                            → {booking_id, status: PENDING, payment_intent}
GET    /api/v1/bookings/:id
DELETE /api/v1/bookings/:id               → cancel (policy-checked)
GET    /api/v1/bookings/mine              ?status=upcoming|past

POST   /api/v1/packages/purchase          {package_id}
                                            → payment_intent
GET    /api/v1/packages/mine              → balances per credit

POST   /api/v1/payments/intent            {booking_id|package_purchase_id, method}
                                            → {redirect_url, payment_id}
GET    /api/v1/payments/:id               → status

POST   /api/v1/payments/one-tap-renew     {package_id, card_token_id}
                                            → {payment_id, status}
```

### Webhooks
```
POST   /api/v1/webhooks/mips              ← signed payload, idempotent
POST   /api/v1/webhooks/sms-status        ← delivery receipts
POST   /api/v1/webhooks/email-status      ← bounce/complaint
```

### Admin (staff)
```
GET    /api/v1/admin/today
GET    /api/v1/admin/schedule             ?week=
POST   /api/v1/admin/classes              {date,time,duration,room,instructor,type,capacity}
PATCH  /api/v1/admin/classes/:id
DELETE /api/v1/admin/classes/:id          → cancel, auto-refund
POST   /api/v1/admin/classes/:id/checkin  {customer_id, status: ATTENDED|NO_SHOW}

GET    /api/v1/admin/customers            ?status=&q=
GET    /api/v1/admin/customers/:id
POST   /api/v1/admin/customers/:id/credit {sessions, reason}     → audit-logged
POST   /api/v1/admin/customers/:id/contact-prefs {sms,email}

POST   /api/v1/admin/bookings/:id/refund  {mode, amount_minor?}

GET    /api/v1/admin/revenue              ?from=&to=
GET    /api/v1/admin/notifications        ?status=

GET    /api/v1/admin/settings
PATCH  /api/v1/admin/settings
GET    /api/v1/admin/packages
POST   /api/v1/admin/packages
PATCH  /api/v1/admin/packages/:id
```

Error envelope:
```json
{ "error": { "code": "BOOKING_FULL", "message": "Class is full",
             "request_id": "req_01HXYZ..." } }
```

---

## 20. Database Schema (MariaDB)

Extends the existing `users` table (staff) with customer-side tables. Money is `BIGINT` minor units. UUIDs as `BINARY(16)` for externally-visible IDs; surrogate `BIGINT` PKs for joins.

```sql
-- Studios -----------------------------------------------------------------
CREATE TABLE studio (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid            BINARY(16)      NOT NULL,
    handle          VARCHAR(64)     NOT NULL,
    name            VARCHAR(160)    NOT NULL,
    timezone        VARCHAR(64)     NOT NULL DEFAULT 'Indian/Mauritius',
    currency        CHAR(3)         NOT NULL DEFAULT 'MUR',
    mips_merchant_id VARCHAR(64)    NULL,
    settings_json   JSON            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_studio_uuid(uuid), UNIQUE KEY uq_studio_handle(handle)
) ENGINE=InnoDB;

-- Staff (extends existing users): users already exist; add studio link.
ALTER TABLE users
  ADD COLUMN studio_id BIGINT UNSIGNED NULL AFTER id,
  ADD KEY idx_users_studio(studio_id);

-- Customers (separate identity from staff) --------------------------------
CREATE TABLE customer (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid            BINARY(16)      NOT NULL,
    studio_id       BIGINT UNSIGNED NOT NULL,
    phone_e164      VARCHAR(20)     NOT NULL,
    email           VARCHAR(254)    NULL,
    name            VARCHAR(160)    NOT NULL,
    locale          VARCHAR(8)      NOT NULL DEFAULT 'fr-MU',
    status          ENUM('ACTIVE','INACTIVE','LOW_BALANCE','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    sms_contactable TINYINT(1)      NOT NULL DEFAULT 1,
    email_contactable TINYINT(1)    NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customer_uuid(uuid),
    UNIQUE KEY uq_customer_studio_phone(studio_id, phone_e164),
    KEY idx_customer_status(studio_id, status)
) ENGINE=InnoDB;

-- Catalog -----------------------------------------------------------------
CREATE TABLE class_type (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    studio_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    duration_min INT NOT NULL,
    PRIMARY KEY(id), KEY idx_ct_studio(studio_id)
) ENGINE=InnoDB;

CREATE TABLE room (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    studio_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(80) NOT NULL,
    default_capacity INT NOT NULL,
    PRIMARY KEY(id)
) ENGINE=InnoDB;

CREATE TABLE instructor (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    studio_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,        -- optional staff login
    name VARCHAR(160) NOT NULL,
    PRIMARY KEY(id)
) ENGINE=InnoDB;

CREATE TABLE package (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    studio_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    sessions_total INT NOT NULL,
    validity_days INT NOT NULL,
    price_minor BIGINT NOT NULL,         -- MUR cents
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY(id)
) ENGINE=InnoDB;

-- Classes -----------------------------------------------------------------
CREATE TABLE class_instance (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid BINARY(16) NOT NULL,
    studio_id BIGINT UNSIGNED NOT NULL,
    class_type_id BIGINT UNSIGNED NOT NULL,
    instructor_id BIGINT UNSIGNED NOT NULL,
    room_id BIGINT UNSIGNED NOT NULL,
    starts_at DATETIME NOT NULL,         -- UTC
    ends_at   DATETIME NOT NULL,
    capacity  INT NOT NULL,
    status    ENUM('DRAFT','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    cutoff_minutes INT NOT NULL DEFAULT 15,
    cancel_free_window_h INT NOT NULL DEFAULT 12,
    policy_snapshot_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    UNIQUE KEY uq_ci_uuid(uuid),
    KEY idx_ci_studio_time(studio_id, starts_at),
    KEY idx_ci_status(status)
) ENGINE=InnoDB;

-- Package credits ---------------------------------------------------------
CREATE TABLE package_credit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid BINARY(16) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    source_package_id BIGINT UNSIGNED NULL,      -- nullable for comp credits
    sessions_total INT NOT NULL,
    sessions_used  INT NOT NULL DEFAULT 0,
    purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME NOT NULL,
    PRIMARY KEY(id),
    UNIQUE KEY uq_pc_uuid(uuid),
    KEY idx_pc_customer_exp(customer_id, expires_at),
    CONSTRAINT chk_pc_used CHECK (sessions_used >= 0 AND sessions_used <= sessions_total)
) ENGINE=InnoDB;

-- Bookings ----------------------------------------------------------------
CREATE TABLE booking (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid BINARY(16) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    class_instance_id BIGINT UNSIGNED NOT NULL,
    status ENUM('PENDING','CONFIRMED','ATTENDED','NO_SHOW',
                'CANCELLED_BY_CUSTOMER','CANCELLED_BY_STUDIO',
                'CANCELLED_FAILED_PAYMENT','CANCELLED_REFUNDED') NOT NULL,
    hold_expires_at DATETIME NULL,                -- for PENDING
    consumed_credit_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    UNIQUE KEY uq_b_uuid(uuid),
    KEY idx_b_class_status(class_instance_id, status),
    KEY idx_b_customer(customer_id, created_at)
) ENGINE=InnoDB;

-- one PENDING per (customer, class)
CREATE UNIQUE INDEX uq_b_one_pending
    ON booking(customer_id, class_instance_id, status)
    WHERE status = 'PENDING';   -- (MariaDB ≥10.5 functional unique via virtual col if needed)

-- Session ledger (append-only) -------------------------------------------
CREATE TABLE session_ledger_entry (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    package_credit_id BIGINT UNSIGNED NOT NULL,
    booking_id BIGINT UNSIGNED NULL,
    delta INT NOT NULL,                          -- -1 or +1 typically
    reason ENUM('BOOKING_CONFIRMED','BOOKING_CANCELLED_FREE',
                'NO_SHOW','MANUAL_ADJUSTMENT','REFUND_RECREDIT',
                'EXPIRY') NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    KEY idx_sle_pc(package_credit_id, created_at),
    KEY idx_sle_booking(booking_id)
) ENGINE=InnoDB;

-- Payments ----------------------------------------------------------------
CREATE TABLE payment (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid BINARY(16) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    booking_id BIGINT UNSIGNED NULL,
    package_credit_id BIGINT UNSIGNED NULL,
    method ENUM('JUICE','CARD','CASH','COMP') NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'MUR',
    mips_payment_id VARCHAR(80) NULL,
    mips_status VARCHAR(40) NULL,
    status ENUM('INITIATED','PENDING','SUCCEEDED','FAILED','REFUNDED','PARTIALLY_REFUNDED') NOT NULL,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    raw_payload JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    succeeded_at DATETIME NULL,
    refunded_at DATETIME NULL,
    PRIMARY KEY(id),
    UNIQUE KEY uq_p_uuid(uuid),
    UNIQUE KEY uq_p_mips(mips_payment_id),       -- idempotency
    KEY idx_p_customer(customer_id),
    KEY idx_p_status(status)
) ENGINE=InnoDB;

CREATE TABLE card_token (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    mips_token VARCHAR(120) NOT NULL,
    brand VARCHAR(20),
    last4 CHAR(4),
    exp_month TINYINT,
    exp_year SMALLINT,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id), KEY idx_ct_customer(customer_id)
) ENGINE=InnoDB;

-- Notifications outbox ----------------------------------------------------
CREATE TABLE notification (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('SMS','EMAIL') NOT NULL,
    template_key VARCHAR(80) NOT NULL,
    payload_json JSON NOT NULL,
    status ENUM('QUEUED','SENT','FAILED','BOUNCED') NOT NULL DEFAULT 'QUEUED',
    provider_message_id VARCHAR(120),
    attempts TINYINT NOT NULL DEFAULT 0,
    scheduled_at DATETIME NOT NULL,
    sent_at DATETIME NULL,
    last_error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    KEY idx_n_status_sched(status, scheduled_at),
    KEY idx_n_customer(customer_id)
) ENGINE=InnoDB;

-- Audit log ---------------------------------------------------------------
CREATE TABLE audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id BIGINT UNSIGNED NULL,
    actor_customer_id BIGINT UNSIGNED NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT UNSIGNED NOT NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    KEY idx_al_entity(entity_type, entity_id),
    KEY idx_al_actor(actor_user_id, created_at)
) ENGINE=InnoDB;
```

Notes on indexes:
- `booking(class_instance_id, status)` is the hot path (capacity calc + check-in screen).
- `notification(status, scheduled_at)` is the worker's poll index.
- `payment(mips_payment_id)` UNIQUE is the webhook idempotency guard.

---

## 21. MVP Delivery Roadmap

12-week pilot, two engineers (1 backend / 1 frontend) + 0.5 designer + Léa as design partner.

**Week 0 — Pre-flight (1 wk)**
- Pilot studio signed as design partner.
- MIPS sandbox credentials, SMS provider account, email sender domain DKIM/SPF.
- Brand kit, copy in FR/EN.

**Sprint 1 (W1–W2): Foundations**
- Schema migration on top of existing `users`.
- Studio + customer entity, OTP/magic-link auth.
- Catalog CRUD (class types, packages, rooms, instructors).

**Sprint 2 (W3–W4): Calendar + Booking core (no payment)**
- Publish weekly schedule.
- Public calendar.
- PENDING booking with seat hold + TTL release.
- Concurrency stress test (100 parallel reservations on 12 mats).

**Sprint 3 (W5–W6): MIPS payment integration**
- Card + Juice via hosted page.
- Webhook + idempotency.
- Reconciliation worker.
- Package purchase + credit ledger + debit on confirmation.

**Sprint 4 (W7–W8): Retention loop**
- Notification outbox + workers.
- Templates FR/EN.
- Low-balance trigger end-to-end.
- One-tap renewal via card token.
- Pre-class reminders.

**Sprint 5 (W9–W10): Admin polish + attendance**
- Today screen, schedule editor (clone-week), customer list & profile, revenue view.
- Attendance tablet view.
- Refund flow.

**Sprint 6 (W11): Hardening**
- Audit log everywhere.
- Backups + restore drill.
- Load test, security review, OWASP pass.

**Week 12: Pilot launch**
- Live with pilot studio.
- Weekly success review: filled-mat ratio, renewals, no-show rate, NPS.
- Bug-bash backlog.

**Exit criteria for MVP-done:**
1. 100 confirmed bookings in production with zero overbookings and zero double-charges.
2. Low-balance loop triggers ≥ 20 measurable rebookings.
3. Reconciliation diff between DB and MIPS settlement = 0 for 4 consecutive weeks.
4. Owner runs a full week without spreadsheets.

---

## 22. Future Expansion Opportunities

**Near-term (Phase 2, +6 months):**
- **Waitlist auto-promotion** with payment hold (joiner pays only if seat opens).
- **Subscription packages** (auto-renew monthly via stored card token — the natural extension of one-tap renew).
- **Multi-studio / chain mode**: one owner runs 2+ locations, unified CRM.
- **Customer segments + targeted campaigns**: "30-day inactive" win-back template.
- **Referral**: shareable code → 1 free session for referrer + referee.
- **Instructor app**: read-only roster, mark attendance, see pay computed at studio's commission rate.

**Mid-term (Phase 3, +12 months):**
- **Vertical expansion**: yoga, barre, dance — same primitive, different copy + capacity rules.
- **Public studio marketplace** ("find a class near you" at MIPS-Booking domain).
- **Gift cards** (a package owned by buyer, redeemable by recipient).
- **Corporate packages** (one buyer, multiple beneficiaries — e.g. employer wellness).
- **MIPS for in-studio retail** (mats, leggings, supplements) — extend the catalog to physical SKUs.

**Long-term (Phase 4, +18 months):**
- **Embedded financing**: BNPL on 20-session packages via MIPS partner banks.
- **Open API** for third-party widgets (Wix, Squarespace, Instagram).
- **Studio analytics SaaS tier**: cohort retention, instructor profitability, peer benchmarking.
- **Cross-vertical loyalty wallet**: one customer wallet, multiple studio types, MIPS-backed.

**Defensible compounding:**
Every new vertical reuses the same `booking + payment + credit-ledger + retention-trigger` core. The MIPS-native rails get stickier as more local merchants plug in. The retention loop is the wedge product; everything else is distribution.

---

## Appendix A — Glossary

- **MIPS**: Mauritius IPS payment gateway; supports card + Juice + reversal + tokenization.
- **Juice**: MCB Juice mobile wallet — dominant local payment method.
- **Mat**: one unit of capacity in a class.
- **Package credit**: a unit of stored consumption (N sessions, expiry).
- **Low-balance trigger**: the automated rebook prompt at `remaining = 1`.
- **Hold TTL**: seconds a PENDING booking holds a seat before auto-release.

## Appendix B — Open Questions for Léa (design partner)

1. Default cancellation window? (Industry standard 12h; some boutiques run 24h.)
2. No-show policy: consume session, or also charge a fee?
3. Package expiry defaults: 60 days for 10-pack? 90 days?
4. Cash drop-in: keep, or kill to push 100% digital?
5. Studio brand on public calendar — own subdomain or `mips.studio/lea-pilates`?
6. Notification language default per customer (FR vs EN) — explicit ask at signup, or infer from browser?
