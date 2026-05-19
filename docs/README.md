# MIPS Booking & Payment Engine — Documentation

Documentation set for the boutique fitness vertical built on the MIPS platform. Start here.

## Read first
1. [`PILATES_MVP_SPEC.md`](./PILATES_MVP_SPEC.md) — the product spec (vision, scope, roadmap). Single source of truth for *what* and *why*.
2. [`getting-started.md`](./getting-started.md) — clone, configure, run the platform locally in under 10 minutes.
3. [`architecture.md`](./architecture.md) — system boundaries, modules, runtime topology.

## Technical reference (for engineers)
| Document | Purpose |
|---|---|
| [`architecture.md`](./architecture.md) | High-level architecture, module map, runtime topology |
| [`database.md`](./database.md) | Schema reference, table-by-table, indexes, invariants |
| [`api-reference.md`](./api-reference.md) | All HTTP endpoints, request/response shapes, error envelope |
| [`booking-engine.md`](./booking-engine.md) | Seat-hold concurrency, ledger logic, state machines |
| [`mips-integration.md`](./mips-integration.md) | Payment intent, webhook, reconciliation, refund, tokenization |
| [`notifications.md`](./notifications.md) | Outbox, templates (FR/EN), retention loop |
| [`security.md`](./security.md) | Auth model, sessions, OWASP baseline, PCI scope |
| [`operations.md`](./operations.md) | Deploy, env vars, backups, runbooks, on-call |
| [`glossary.md`](./glossary.md) | Domain vocabulary |
| [`contributing.md`](./contributing.md) | Branch model, PR rules, code style |
| [`decisions/`](./decisions/) | Architecture Decision Records (ADRs) |

## User manuals (for end users)
| Document | Audience |
|---|---|
| [`user-manual/customer-en.md`](./user-manual/customer-en.md) | Customer — English |
| [`user-manual/customer-fr.md`](./user-manual/customer-fr.md) | Client — Français |
| [`user-manual/studio-admin-en.md`](./user-manual/studio-admin-en.md) | Studio staff — English |
| [`user-manual/studio-admin-fr.md`](./user-manual/studio-admin-fr.md) | Personnel du studio — Français |

## How the docs are organized

```
docs/
├── README.md                  ← you are here
├── PILATES_MVP_SPEC.md        ← product spec (the "what")
├── architecture.md            ← the "how, big picture"
├── booking-engine.md          ← the "how, hot path"
├── mips-integration.md        ← the "how, money"
├── notifications.md           ← the "how, retention"
├── database.md                ← the "what is stored, where"
├── api-reference.md           ← the "wire contract"
├── security.md
├── operations.md
├── getting-started.md
├── glossary.md
├── contributing.md
├── decisions/
│   ├── 0001-uniform-package-credit-model.md
│   └── ...
└── user-manual/
    ├── customer-en.md
    ├── customer-fr.md
    ├── studio-admin-en.md
    └── studio-admin-fr.md
```

## Conventions used in these docs
- All money values are expressed in **MUR minor units** (1 MUR = 100 minor units). Never floats.
- All timestamps stored in **UTC**, displayed in `Indian/Mauritius` (UTC+4).
- Customer-facing copy is shown in both **FR** and **EN**.
- Code blocks marked `sql`, `php`, `http`, `json`, `bash` — use these consistently.
- ADRs follow the [Michael Nygard format](https://github.com/joelparkerhenderson/architecture-decision-record).

## Audience
- **Engineers** building the platform → start with `getting-started.md` and `architecture.md`.
- **Product / pilot studio (Léa)** → read `PILATES_MVP_SPEC.md` for the strategy, then `user-manual/studio-admin-{fr,en}.md` for day-to-day operation.
- **Customers** → `user-manual/customer-{fr,en}.md` (shipped in-app via Help link).
- **Ops / on-call** → `operations.md` and `decisions/`.
- **Security review** → `security.md` and the `audit_log` parts of `database.md`.
