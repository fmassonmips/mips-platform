# Compliance & Regulatory Notes

> **This is a sandbox/prototype.** Do **not** assume any entity is licensed,
> operational, approved, or authorised unless explicitly configured. These notes
> are engineering guidance, **not legal advice**. Validate with qualified
> Mauritian counsel and the regulator before any live operation.

## 1. Entity separation (the cardinal rule)

| Entity | Role | May do | Must NOT do |
|--------|------|--------|-------------|
| **PassPass Ltd** | Regulated PSP | Hold the PSP licence; approve merchants; decide KYC/AML; execute regulated payments; supervise settlement. | — |
| **MIPSIT Digital Ltd** | Technology provider | Operate the platform; acquire merchants; orchestrate payments; provide dashboards, reporting, reconciliation tooling, APIs. | Represent itself as a licensed PSP; make regulated payment/KYC decisions on its own. |
| **Partner Bank** | Banking infrastructure | Hold the segregated settlement account; move funds. | — |
| **Inflow** | Orchestration / workflow engine | Coordinate multi-step flows. | Act as a payment rail or PSP. |
| **Paypump** | Payout / transfer connector | Execute routed transfers/payouts. | Act as the regulated PSP. |

**The platform must never represent MIPS as a licensed PSP.** This is enforced in:
- **Config** — `REGULATED_ENTITY=PassPass`, `TECHNOLOGY_PROVIDER=MIPSIT Digital Ltd`.
- **Data** — `regulated_entity` is stamped on `transactions` and `settlements`.
- **Code** — regulated verbs (`createMerchant`, `submitKyc`, `approveMerchant`,
  `createSettlement`) exist only on `PassPassProvider`, via the
  `MerchantProvider` / `SettlementProvider` capability interfaces.
- **RBAC** — `merchant.approve`, `kyc.decide`, `compliance.*` are granted only to
  `compliance_officer` (acting for PassPass).

## 2. Configurable legal disclaimer

A single source of truth lives in `config['platform']['legal_disclaimer']` and
must be rendered on every compliance-related screen (onboarding, KYC, settlement,
payment confirmation). Override per environment via the `PLATFORM_*` env vars or
the `system_settings` table.

Default text:

> *This is a sandbox/prototype of a payment platform. PassPass Ltd is the
> regulated payment service provider; MIPSIT Digital Ltd is the technology and
> orchestration provider. No entity is represented as licensed, approved or
> operational unless explicitly configured.*

## 3. KYC & AML workflow

- **KYC states:** `DRAFT → SUBMITTED → REVIEW → APPROVED | REJECTED`
  (`App\Domain\KycStatus`). A merchant may transact only when `APPROVED`.
- **Compliance states:** `PENDING → CLEARED → FLAGGED → SUSPENDED → CLOSED`
  (`App\Domain\ComplianceStatus`). Transacting requires `CLEARED`.
- **Risk scoring:** numeric 0–100 → `LOW (<40) / MEDIUM (40–69) / HIGH (≥70)`
  (`App\Domain\RiskRating::fromScore`). Stored on `merchants` and per review in
  `risk_reviews`.
- **AML notes / compliance comments:** `risk_reviews.notes`, `kyc_reviews.notes`.
- **Audit trail:** every compliance action should write an `audit_logs` row
  (actor, action, entity, before/after).

Decisions are recorded against a PassPass `compliance_officer` user
(`kyc_reviews.reviewer_user_id`).

## 4. Funds safeguarding

- Customer funds must sit in a **segregated** partner-bank account controlled by
  PassPass, never commingled with MIPSIT operating funds.
- Settlement execution is **supervised by PassPass**; MIPSIT prepares batches and
  reconciliation under that supervision.

## 5. Data protection & security (Mauritius DPA 2017 aware)

- **No PAN / CVV / full bank credentials stored.** Bank accounts are masked
  (`merchant_bank_accounts.account_number_masked`); card rail is a stub that
  stores nothing; virtual credentials hold opaque tokens only.
- **Secrets in ENV**, never in the repo. `.htaccess` denies dotfiles, `.sql`, `.md`.
- **JWT/Session auth, RBAC, CSRF, rate limiting, hardened sessions, security
  headers, HMAC webhook verification** — see `ARCHITECTURE.md` §1.3.
- Apply data-minimisation and retention policies before go-live.

## 6. Pre-go-live checklist

- [ ] PassPass PSP licence verified and referenced in config.
- [ ] Segregated client-money account confirmed with Partner Bank.
- [ ] Legal review of all customer-facing copy (no PSP misrepresentation).
- [ ] DPA 2017 registration / data-processing agreements in place.
- [ ] Live webhook secrets provisioned; signature verification mandatory.
- [ ] Demo seed accounts removed; real RBAC users provisioned.
- [ ] Penetration test / security review completed.
