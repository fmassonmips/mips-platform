# MIPS platform — all screens (demo build)

Captured 2026-10-27 from the development prototype (branch `ccr-a3522d3b-pyyp68`, build 590d8d8) running on a
**separate demo database with fictitious data**. Not the production MIPS platform, not my.mips.mu.
Every image carries the red "DEMONSTRATION ENVIRONMENT" banner. No real merchant, person, bank account or secret appears.

| File | Screen | Signed in as |
|---|---|---|
| 01-login | Login | — |
| 02-login-second-factor | Login, second factor (TOTP / recovery code) | — |
| 03-forgot-password | Forgotten password | — |
| 04-reset-password | Reset password (valid link) | — |
| 05-register | Account creation (accounts start inactive until an admin activates them) | — |
| 10-dashboard | Home | finance |
| 11-merchants-list | Merchants list, status counters, last-month volume | finance |
| 12-merchant-detail-active | Merchant record: identity, onboarding, contracts, contacts, identifiers (MIDs), activity, invoices, history | finance |
| 13-merchant-detail-prospect | Merchant record in onboarding | finance |
| 14-onboarding-cases | Onboarding/KYC cases, statuses, alerts | finance |
| 15-onboarding-case-collecting | Case in collection: blockers, document checklist, parties, screening, reminders | finance |
| 16-reports-monthly-and-trends | Commission_Data import (file / BigQuery), 12-month trends, monthly report | finance |
| 17-billing-invoices-and-fee-rules | Invoices of the month (draft / issued / paid) and fee rules | finance |
| 18-invoice-paid | Invoice, paid | finance |
| 19-invoice-draft | Invoice, draft (no number yet) | finance |
| 20-recon-runs | MCB vs MIPS reconciliation runs, new run | finance |
| 21-recon-run-detail | Reconciliation detail: gap by category, % views, gaps by merchant | finance |
| 22-account-security | Own account: 2FA, recovery codes, password change | finance |
| 23-onboarding-case-under-review-approver | Case under review, approver view (four-eyes decision) | admin |
| 24-onboarding-case-approved | Approved case, decision recorded | admin |
| 25-users-and-roles | Users, roles, activation, 2FA status | admin |
| 26-audit-log | Audit log (first page) | admin |

Users with the `finance` role do not see the Users and Audit log menus (admin only).
The demo database was cleaned of test leftovers before capture (BigQuery emulator rows, a test invoice and their audit entries).
