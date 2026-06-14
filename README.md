# PassPass Platform (MIPS)

A Mauritian payment platform built around a **PSP model**:

- **PassPass Ltd** — the regulated payment service provider (PSP licence holder).
- **MIPSIT Digital Ltd** — the technology, orchestration, and merchant-enablement
  provider that operates this platform.
- **Partner Bank** — settlement and banking infrastructure.

> ⚠️ **Sandbox / prototype.** No entity is licensed, approved, or operational
> unless explicitly configured. **The platform must never represent MIPS as a
> licensed PSP** — all regulated activities are performed by PassPass. See
> [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md).

## What this platform does

Merchants and consumers initiate and receive payments via **Pay by Bank**,
**Merchant QR**, **Payment Links**, and **Virtual Payment Credentials**, with
**card rails stubbed** for the future. Payments are routed to providers by a
configurable engine, executed by the regulated PSP, settled through the partner
bank, and reconciled.

```
Customer → MIPS Platform → PassPass PSP → Partner Bank → Merchant Settlement
```

## Tech stack

PHP 8.1+ · MariaDB · Apache · vanilla JS views · Docker (local sandbox).
Built on the existing security-conscious auth core (PDO prepared statements,
CSRF, rate limiting, hardened sessions, RBAC).

## Quick start

```bash
cp .env.example .env
docker compose up --build
# http://localhost:8080  —  admin@example.com / Admin123!
```

See [`docs/INSTALL_DEPLOY.md`](docs/INSTALL_DEPLOY.md) for local PHP and shared-
hosting options.

## Repository layout

```
config/        config.php (app, db, platform/regulatory, providers, routing)
public/        web entry points (pages + /api/*). DocumentRoot points here.
src/
  Domain/      enums + transaction state machine (PaymentType, TransactionStatus, …)
  Support/     Money (integer minor units), Reference (opaque IDs)
  Providers/   PaymentProvider + capability interfaces + 4 adapters + registry
  Routing/     PaymentRouter (configurable engine)
  Rbac.php     role → permission table
  (+ existing Auth/Session/Csrf/RateLimiter/Database/Response/Validator)
sql/           schema.sql, seed.sql (base) + passpass_schema.sql, passpass_seed.sql
docs/          ARCHITECTURE, COMPLIANCE, API, INSTALL_DEPLOY, TEST_SCENARIOS
```

## Providers & routing

| Payment type | Provider | Regulated |
|---|---|---|
| `BANK_TRANSFER` / `QR` / `PAYMENT_LINK` / `VIRTUAL_CREDENTIAL` | `passpass` | ✅ |
| `PAYPUMP_TRANSFER` | `paypump` | ❌ payout connector |
| `WORKFLOW` | `inflow` | ❌ orchestration |
| `CARD` | `cardrail` (stub) | ❌ no PCI scope |

All adapters run in **sandbox/stub** mode in the MVP — no real money moves and no
real PSP API is called, but the seams (config, HMAC webhook verification,
normalised results) are real.

## Documentation

- [Architecture & review](docs/ARCHITECTURE.md) — risks, regulatory assumptions,
  gaps, diagrams, ERD, phased plan.
- [Compliance notes](docs/COMPLIANCE.md)
- [API specification](docs/API.md)
- [Install & deploy](docs/INSTALL_DEPLOY.md)
- [Test scenarios](docs/TEST_SCENARIOS.md)

## Status

Phases 1–6 delivered. The **onboarding → KYC → Pay by Bank → settlement** path is
wired through every layer (controllers → services → providers → router → DB →
state machine → events) and verified end-to-end against a live MariaDB. A
role-aware portal (`public/portal.php`) drives the flow for merchant, consumer,
compliance, finance and admin users.

Next: reconciliation engine, full KPI dashboards, remaining product surfaces
(links/QR/virtual credentials), and an automated test suite. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9.
