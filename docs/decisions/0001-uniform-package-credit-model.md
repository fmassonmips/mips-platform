# 0001 — Uniform package-credit model for drop-ins and packs

## Status
Accepted (2026-05-19)

## Context
Boutique fitness studios sell two superficially different things:
- A single class (a "drop-in"): pay MUR 450, attend once, gone.
- A multi-class package: pay MUR 2,000, attend 5 times within 60 days.

A naive model treats these as two entities (`SinglePurchase` vs `Package`), with separate booking pathways: drop-in bookings go through a synchronous "pay and consume" flow, packages go through a "buy → store balance → debit-on-book" flow. The application code then has two ledgers, two refund paths, two reporting code paths.

This duplication causes bugs (we've seen it in the team's past projects): a drop-in refund that doesn't debit the booking, a "credit-to-package" refund mode that doesn't apply to drop-ins, an attendance report that double-counts drop-ins because they have no package row.

## Decision
**A drop-in is a 1-session package with `validity_days = 1`.**

The only entity is `package_credit`, with `sessions_total ≥ 1`. The booking-confirmation flow always:
1. Picks the oldest active credit (FOR UPDATE).
2. Inserts a `session_ledger_entry` with `delta = -1`.
3. Increments `sessions_used`.
4. Flips the booking to `CONFIRMED`.

A customer paying for a single class:
- Buys a `package_credit` with `sessions_total=1, validity_days=1`.
- Books the class.
- Same code path consumes the session.

A refund of a single-class booking is a refund of a 1-session package — same path as any other refund.

A multi-class package is just a credit with `sessions_total > 1`.

## Consequences

**Positive:**
- One ledger, one consumption code path, one refund path, one reporting path.
- Adding new package shapes (e.g. 20-pack, gift card) is trivial — just a new row in `package`.
- Tests for the booking-confirmation path cover both cases by default.
- Reports `GROUP BY sessions_total` to distinguish drop-ins from packs when needed.

**Negative:**
- Slightly more rows in `package_credit` (one per drop-in instead of just a payment).
- "Drop-in" is no longer a first-class concept in the schema; it's a property of the credit. New developers have to learn the model.
- Some UI copy needs care: "you have 1 session" can mean "you have a drop-in" or "you have 1 session left on a 10-pack". The UI distinguishes by showing the package name.

**Mitigations for negatives:**
- Document the model prominently in `database.md` and this ADR.
- Index `package_credit(customer_id, expires_at)` to keep the credit-selection query fast even with many drop-in rows.
- Customer balance UI shows "1 session — drop-in" vs "1 session left on 10-pack" explicitly.

## Alternatives considered

1. **Separate `SinglePurchase` entity**: rejected for the duplication reasons above.
2. **No package_credit at all, only `payment` + counting bookings**: rejected because (a) refunds break the count, (b) expiry rules can't be expressed, (c) admins can't issue comp credits without a money trail.
3. **Hybrid: package_credit for packs, payment-as-credit for drop-ins**: rejected — combines the worst of both, still requires two code paths.

## Related
- `database.md` §2.8–2.9
- `booking-engine.md` §4
- `PILATES_MVP_SPEC.md` §11 (Session / Package Consumption Logic)
