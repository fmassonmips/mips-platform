# SaaS tenant configuration

| Item | Where | Notes |
|---|---|---|
| Tenant record | `tenants` (code, name, legal name, country, base currency, FY start month, plan, status, is_demo) | Provisioned with `provisionTenant()`; base currency is fixed once data exists |
| Feature activation | `tenants.features` | `merchant_intelligence`, `decision_center`, `proof_center`, `strategy`, `ai_analyst`, `treasury`, `board_reporting`, `integrations` (menu gating by flag is on the roadmap; permissions gate today) |
| Policies | `tenants.settings` | revenue recognition, allocation, liquidity floor, materiality, alert threshold, reconciliation tolerance, MFA-required roles |
| Roles & permissions | `roles`, `role_permissions` | system roles provisioned per tenant; custom roles allowed |
| Chart of accounts | `chart_of_accounts` | `pl_line` mapping drives the P&L; `cost_category` / `cost_behaviour` drive cost analytics; `revenue_stream` (`TXN`, `SAAS`, `OTHER`) drives the GL↔engine revenue reconciliation |
| Products / channels / acquirers / methods / verticals | reference tables | tenant-specific; no partner logic is hard-coded |
| KPI definitions | `kpi_definitions`, `formula_versions` | synced from the engine registry; materiality per KPI |
| Pricing & fees | `pricing_agreements`, `fee_schedules`, `processing_cost_rates` | effective-dated, preserving historical calculations |
| Subscription readiness | `tenants.plan`, `status` | billing integration on the roadmap |

Second demo tenant `acme-pay-demo` exists to demonstrate isolation; `admin@mips.demo` is a member of both and can switch tenants from the header.
