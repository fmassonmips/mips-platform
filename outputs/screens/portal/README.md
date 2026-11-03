# Merchant portal (phase 2) — screens (demo build)

Captured 2026-10-28 from the development prototype, build d91d250, on a separate demo database with
fictitious data. Not the production MIPS platform, not my.mips.mu. Every image carries the red
"DEMONSTRATION ENVIRONMENT" banner. The two-factor QR code and key are blurred (secrets). The terms of use
shown are a placeholder text, not MIPS terms: the real text must come from MIPS legal / compliance.

| File | Screen | Who |
|---|---|---|
| P01-register | Account creation | merchant (signed out) |
| P02-login | Sign-in | merchant (signed out) |
| P03-two-factor-enrolment | Mandatory two-factor set-up at first sign-in (QR / key blurred) | merchant |
| P04-terms-acceptance | Terms of use, current version, acceptance | merchant |
| P05-progress-start | Progress tracker, start | merchant |
| P06-prequalification-form | Pre-qualification form | merchant |
| P07-progress-prequalification-review | Tracker: pre-qualification under MIPS review | merchant |
| P08-staff-portal-applications | Portal applications to review | MIPS analyst |
| P09-staff-application-review | Application detail, accept / decline, portal account and consent log | MIPS analyst |
| P10-documents-in-progress | People declared, documents being uploaded, what is still missing | merchant |
| P11-documents-rejection-reason | A document not accepted, with the reason given by MIPS | merchant |
| P12-progress-file-sent-not-approved | Tracker: file sent to MIPS, explicitly not approved yet | merchant |
| P13-staff-case-merchant-uploads | Onboarding case: merchant uploads, portal account, history | MIPS analyst |
| P14-staff-terms-versions | Terms of use versions and acceptance count | MIPS admin |

Not shown and not claimed: approval of the merchant (decided in the case by a second person), antivirus
(code path tested with a stand-in scanner; no scanner installed in the demo, uploads are marked "not scanned").
