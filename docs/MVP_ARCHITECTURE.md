# InsurLink MU — Mauritian Insurance Broker Platform
## MVP Architecture & Product Blueprint
**Version 1.0 | Board-Ready Format**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Positioning](#2-product-positioning)
3. [User Personas](#3-user-personas)
4. [MVP Scope](#4-mvp-scope)
5. [Main Workflows](#5-main-workflows)
6. [Data Model](#6-data-model)
7. [Screen List](#7-screen-list)
8. [Automation Logic](#8-automation-logic)
9. [AI Module Roadmap](#9-ai-module-roadmap)
10. [Risk & Compliance Considerations](#10-risk--compliance-considerations)
11. [90-Day Implementation Roadmap](#11-90-day-implementation-roadmap)
12. [Pricing Model for Brokers](#12-pricing-model-for-brokers)

---

## 1. Executive Summary

**The problem:** Mauritian insurance brokers operate largely on spreadsheets, WhatsApp reminders, and manual payment follow-ups. Clients routinely let policies lapse by days or weeks, exposing themselves to coverage gaps and brokers to commission claw-backs. No local platform bridges appointment scheduling, digital payments (MIPS/Juice), CRM, and renewals in a single workflow.

**The solution:** InsurLink MU is a SaaS broker-of-record platform that unifies:
- Appointment booking (inspections, risk audits)
- MIPS/Juice payment links embedded in every touchpoint
- Policy lifecycle CRM with automated renewal pipelines
- AI-assisted comparative quoting (Phase 2)

**Target addressable market:** ~150 licensed insurance brokers in Mauritius (FSC-registered), managing an estimated MUR 4–6 billion in annual premium volume. Even a 20% broker adoption at MUR 2,500/seat/month represents a MUR 9M+ ARR opportunity at MVP stage.

---

## 2. Product Positioning

### 2.1 Positioning Statement

> For **insurance brokers in Mauritius** who are losing revenue to lapsed policies and manual admin,
> **InsurLink MU** is a **broker operations platform** that automates the full policy lifecycle —
> from first appointment to renewal payment — unlike generic CRMs or standalone MIPS dashboards,
> InsurLink MU is built specifically for the Mauritian insurance market, with local insurer integrations,
> FSC compliance tooling, and MIPS/Juice payment links at every touchpoint.

### 2.2 Competitive Differentiation

| Dimension | Generic CRM (HubSpot, Zoho) | WhatsApp + Spreadsheet | InsurLink MU |
|---|---|---|---|
| Mauritius-specific workflows | No | No | Yes |
| MIPS/Juice payment links | No | No | Native |
| Renewal automation | Manual | Manual | J-45 automated |
| Inspection booking | No | No | Yes (video + in-person) |
| AI quote comparison | No | No | Phase 2 roadmap |
| FSC audit trail | No | No | Built-in |
| WhatsApp integration | Via plugin | Manual | Native |

### 2.3 Brand Principles

- **Trust first:** Every screen reinforces data security and FSC compliance.
- **Broker-centric:** The platform earns money *for* the broker, not despite them.
- **Mobile-first:** Most Mauritian brokers operate primarily from phones.
- **Bilingual:** English + French interface from day one.

---

## 3. User Personas

### Persona 1: Raj, the Independent Broker (Primary)

| Attribute | Detail |
|---|---|
| Age | 38 |
| Location | Quatre Bornes |
| Book of business | ~180 clients, MUR 12M in premiums |
| Current tools | WhatsApp, Excel, physical diary |
| Pain points | Clients ignoring renewal SMS, chasing payments, forgetting inspection appointments |
| Goals | Spend less time chasing, more time selling |
| Tech comfort | Medium — uses smartphone confidently, wary of complex software |
| Key trigger | Lost a fleet client (MUR 340k premium) due to missed renewal |

**Jobs to be done:**
- *"When a client's policy is near expiry, remind them automatically so I don't have to."*
- *"Send them a payment link they can actually click and pay — not a bank transfer."*
- *"Book an inspection without 10 WhatsApp messages back and forth."*

---

### Persona 2: Marie, the Brokerage Manager (Secondary)

| Attribute | Detail |
|---|---|
| Age | 45 |
| Location | Port Louis |
| Role | Runs a team of 6 agents, reports to MD |
| Pain points | No visibility on which renewals are at risk, agents' pipelines are siloed |
| Goals | Real-time dashboard of renewal pipeline, agent performance, overdue premiums |
| Tech comfort | High — uses Outlook, Excel pivot tables |

**Jobs to be done:**
- *"Show me every policy expiring in the next 60 days and where each one is in the renewal workflow."*
- *"Tell me which agent has the highest lapse rate this quarter."*

---

### Persona 3: Priya, the Insurance Client (End-user, not paying customer)

| Attribute | Detail |
|---|---|
| Age | 32 |
| Location | Ebene |
| Policies held | Motor (comprehensive), life |
| Behaviour | Procrastinates on renewal, prefers WhatsApp to email, pays with Juice |
| Pain points | Doesn't understand what she's renewing, just wants it to be easy |

**Jobs to be done:**
- *"Get a message I can act on immediately — click, pay, done."*
- *"Know that my car is covered before I drive tomorrow."*

---

### Persona 4: Kevin, the Insurtech-Forward MD (Champion buyer)

| Attribute | Detail |
|---|---|
| Age | 52 |
| Role | MD of a mid-size brokerage (15 agents) |
| Goal | Modernise operations, reduce admin headcount, win larger fleet/commercial accounts |
| Buying trigger | Board pressure on expense ratios, interest in AI differentiation |

---

## 4. MVP Scope

### 4.1 In Scope — MVP (Days 1–90)

| Module | Core Features |
|---|---|
| **Auth & Multi-tenancy** | Broker firm accounts, agent sub-accounts, role-based access (admin / agent / read-only) |
| **Client CRM** | Client profiles, contact history, document store, policy list per client |
| **Policy Management** | Policy CRUD, insurer, product type, premium, start/end dates, status lifecycle |
| **Appointment Booking** | Calendar booking (in-person + video link), inspection type selection, confirmation email/SMS |
| **MIPS Payment Links** | Generate payment link per policy/instalment, track payment status webhook, embed in renewal message |
| **Renewal Automation** | J-45 / J-30 / J-15 / J-0 pipeline, email + WhatsApp dispatch, payment link auto-attached |
| **Dashboard** | Renewal pipeline kanban, overdue premiums, revenue at risk, upcoming appointments |
| **Notifications** | Email (SMTP), WhatsApp (via WhatsApp Business API), in-app |
| **Audit Trail** | FSC-ready log of every action, communication, and payment event |

### 4.2 Out of Scope — MVP (Phase 2+)

| Feature | Target Phase |
|---|---|
| AI comparative quoting (SWAN, MUA, Jubilee, etc.) | Phase 2 |
| Direct insurer API integrations | Phase 2 |
| Instalment / recurring payment scheduling | Phase 2 |
| Mobile native app (iOS/Android) | Phase 3 |
| Claims management | Phase 3 |
| Broker commission reconciliation | Phase 2 |
| E-signature on policy documents | Phase 2 |
| Open API for third-party integrations | Phase 3 |

### 4.3 MVP Success Metrics

| Metric | 90-Day Target |
|---|---|
| Broker firms onboarded (paid) | 5 |
| Policies under management | 500 |
| Renewal workflows triggered | 200 |
| MIPS payment links generated | 150 |
| Average renewal conversion rate | >65% |
| Client NPS (broker-reported) | >7/10 |

---

## 5. Main Workflows

### 5.1 Workflow A: Client Onboarding & Policy Creation

```
Broker logs in
    → "Add Client" (name, NIC, phone, email, address)
    → "Add Policy"
        → Select Insurer (SWAN / MUA / Jubilee / CIM / other)
        → Select Product Type (motor / property / life / liability / marine / health)
        → Enter: premium amount, policy number, start date, end date
        → Upload policy document (PDF)
    → System sets status = ACTIVE
    → System creates renewal record (expiry - 45 days = first trigger date)
    → Confirmation notification to client (optional)
```

---

### 5.2 Workflow B: Inspection / Risk Audit Booking

```
Broker or client requests inspection
    → Broker selects client + policy type
    → System presents available time slots (broker's calendar)
    → Broker/client selects slot + appointment type:
        - Vehicle inspection (in-person, location required)
        - Building survey (in-person, address required)
        - Risk audit (video call — system generates Whereby/Zoom link)
    → System sends confirmation:
        - Email with calendar .ics attachment
        - WhatsApp with appointment details + video link (if applicable)
    → Day-before reminder sent automatically
    → Post-appointment: broker logs inspection outcome, uploads photos/report
    → Inspection status linked to policy (required before issuance flag)
```

---

### 5.3 Workflow C: MIPS Payment Link Generation

```
Broker opens a policy or renewal record
    → "Generate Payment Link"
        → Enter amount (full premium or instalment)
        → Select payment type: full / instalment 1 of N
        → Add reference (policy number auto-populated)
    → System calls MIPS API → returns payment URL
    → Link stored against policy/payment record
    → Broker can:
        - Copy link manually
        - Attach to renewal email/WhatsApp (one click)
        - Embed in client portal page (Phase 2)
    → MIPS webhook → payment confirmed → policy status updated → broker notified
    → Receipt generated and emailed to client
```

---

### 5.4 Workflow D: Automated Renewal Pipeline (Core Differentiator)

```
Daily cron job runs at 08:00
    → Query: all policies where expiry_date = TODAY + 45 days AND renewal_status = 'pending'
    → For each match:
        → Create renewal record (status: J45_INITIATED)
        → Generate MIPS payment link for renewal premium
        → Compose personalised message (template + client name + policy + amount + link)
        → Dispatch: email + WhatsApp
        → Log communication event

    → J-30 trigger (if renewal_status still 'pending'):
        → Second email + WhatsApp (urgency tone)
        → Assign task to responsible broker agent
        → Flag on dashboard as "Needs attention"

    → J-15 trigger (if still 'pending'):
        → Third message (critical tone)
        → Manager escalation notification
        → Revenue-at-risk amount surfaced on dashboard

    → J-0 (expiry day, still 'pending'):
        → Policy status → LAPSED
        → Broker alert (high priority)
        → Client final message ("Your policy has lapsed — contact your broker immediately")
        → Commission-at-risk flag on broker revenue report

    → Renewal paid (webhook received):
        → renewal_status → COMPLETED
        → New policy period created (start = old expiry + 1 day)
        → All pending reminders cancelled
        → Thank-you message to client
```

---

### 5.5 Workflow E: Quote Comparison (Phase 2 Preview)

```
Broker initiates quote request for client
    → Enter: client profile, asset details (vehicle make/model/year or property details)
    → System dispatches structured query to insurer APIs or web scrapers
    → Returns: 3 best quotes ranked by premium, coverage score, insurer rating
    → Broker reviews, selects, customises cover note
    → System auto-populates renewal message with top 3 quotes + payment link
    → Client clicks preferred option → MIPS payment → policy issued
```

---

## 6. Data Model

The following extends the existing `mips_platform` schema.

### Core Entities & Relationships

```
brokerages (1) ──< agents (N)
agents (1) ──< clients (N)
clients (1) ──< policies (N)
policies (1) ──< renewals (N)
policies (1) ──< payment_links (N)
policies (1) ──< appointments (N)
policies (1) ──< documents (N)
renewals (1) ──< communications (N)
payment_links (1) ──< payment_events (N)
insurers (1) ──< insurer_products (N)
insurer_products (1) ──< policies (N)
```

### Table Definitions

#### `brokerages`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| name | VARCHAR(150) | Firm name |
| fsc_license_number | VARCHAR(50) | FSC broker licence |
| email | VARCHAR(254) | |
| phone | VARCHAR(30) | |
| address | TEXT | |
| mips_merchant_id | VARCHAR(100) | MIPS API credential |
| mips_api_key | VARCHAR(255) | Encrypted at rest |
| whatsapp_number | VARCHAR(30) | WA Business number |
| subscription_plan | VARCHAR(30) | starter/growth/pro |
| subscription_status | VARCHAR(20) | active/suspended/trial |
| created_at | DATETIME | |

#### `agents` (extends `users`)
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK → users | Auth credentials |
| brokerage_id | BIGINT FK → brokerages | |
| role | ENUM | admin/agent/readonly |
| calendar_timezone | VARCHAR(50) | Default Africa/Mauritius |
| working_hours_json | JSON | `{"mon":["09:00","17:00"],...}` |
| is_active | TINYINT(1) | |

#### `clients`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| brokerage_id | BIGINT FK | |
| agent_id | BIGINT FK → agents | Assigned broker |
| first_name | VARCHAR(80) | |
| last_name | VARCHAR(80) | |
| nic_number | VARCHAR(20) | Mauritius NIC |
| email | VARCHAR(254) | |
| phone_mobile | VARCHAR(30) | +230 format |
| phone_whatsapp | VARCHAR(30) | May differ from mobile |
| date_of_birth | DATE | |
| address | TEXT | |
| client_type | ENUM | individual/company |
| company_name | VARCHAR(150) | If company |
| brn_number | VARCHAR(20) | Business registration |
| language_pref | ENUM | en/fr |
| communication_pref | JSON | `["email","whatsapp"]` |
| notes | TEXT | |
| created_at | DATETIME | |

#### `insurers`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| name | VARCHAR(100) | SWAN, MUA, Jubilee, CIM, etc. |
| short_code | VARCHAR(20) | swan/mua/jubilee/cim |
| api_endpoint | VARCHAR(255) | Phase 2 |
| api_key_encrypted | TEXT | Phase 2 |
| is_active | TINYINT(1) | |

#### `insurer_products`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| insurer_id | BIGINT FK | |
| product_type | ENUM | motor/property/life/health/liability/marine/fleet/other |
| product_name | VARCHAR(150) | e.g. "Motor Comprehensive Plus" |
| description | TEXT | |
| is_active | TINYINT(1) | |

#### `policies`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| client_id | BIGINT FK | |
| agent_id | BIGINT FK | |
| insurer_id | BIGINT FK | |
| insurer_product_id | BIGINT FK | |
| policy_number | VARCHAR(60) | Insurer-assigned |
| internal_ref | VARCHAR(30) | Platform-generated |
| status | ENUM | draft/active/lapsed/cancelled/renewed/claimed |
| premium_amount | DECIMAL(12,2) | MUR |
| sum_insured | DECIMAL(15,2) | MUR |
| excess_amount | DECIMAL(10,2) | |
| start_date | DATE | |
| end_date | DATE | |
| cover_type | VARCHAR(60) | comprehensive/third-party/etc. |
| asset_description | TEXT | Vehicle reg / property address |
| asset_metadata_json | JSON | `{"make":"Toyota","model":"Vios","year":2021,"reg":"B1234"}` |
| payment_frequency | ENUM | annual/semi-annual/quarterly/monthly |
| broker_commission_pct | DECIMAL(5,2) | |
| broker_commission_amt | DECIMAL(10,2) | Calculated |
| inspection_required | TINYINT(1) | Default 0 |
| inspection_completed | TINYINT(1) | Default 0 |
| notes | TEXT | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

#### `renewals`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| policy_id | BIGINT FK | |
| renewal_year | YEAR | |
| status | ENUM | pending/contacted/negotiating/quoted/paid/lapsed/cancelled |
| trigger_date_j45 | DATE | expiry - 45 days |
| trigger_date_j30 | DATE | expiry - 30 days |
| trigger_date_j15 | DATE | expiry - 15 days |
| j45_sent_at | DATETIME | NULL if not yet sent |
| j30_sent_at | DATETIME | |
| j15_sent_at | DATETIME | |
| j0_sent_at | DATETIME | |
| renewal_premium | DECIMAL(12,2) | May differ from original |
| payment_link_id | BIGINT FK → payment_links | |
| notes | TEXT | |
| completed_at | DATETIME | When paid |
| created_at | DATETIME | |

#### `appointments`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| client_id | BIGINT FK | |
| policy_id | BIGINT FK | NULL if pre-policy |
| agent_id | BIGINT FK | |
| appointment_type | ENUM | vehicle_inspection/building_survey/risk_audit/general_meeting |
| format | ENUM | in_person/video |
| scheduled_at | DATETIME | |
| duration_minutes | INT | Default 30 |
| location | VARCHAR(255) | Physical address or NULL |
| video_link | VARCHAR(500) | Whereby/Zoom/Teams URL |
| status | ENUM | scheduled/confirmed/completed/cancelled/no_show |
| notes_pre | TEXT | Pre-appointment instructions |
| notes_post | TEXT | Broker's outcome notes |
| inspection_report_path | VARCHAR(500) | Uploaded PDF |
| reminder_sent | TINYINT(1) | Day-before reminder flag |
| created_at | DATETIME | |

#### `payment_links`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| policy_id | BIGINT FK | |
| renewal_id | BIGINT FK | NULL if ad-hoc |
| generated_by_agent_id | BIGINT FK | |
| mips_transaction_ref | VARCHAR(100) | MIPS-assigned |
| amount | DECIMAL(12,2) | MUR |
| description | VARCHAR(255) | Shown on MIPS page |
| payment_url | VARCHAR(1000) | Full MIPS URL |
| instalment_number | TINYINT | 1 of N; NULL if full payment |
| instalment_total | TINYINT | N; NULL if full payment |
| status | ENUM | pending/paid/expired/failed/refunded |
| expires_at | DATETIME | |
| paid_at | DATETIME | |
| mips_webhook_payload | JSON | Raw webhook for audit |
| created_at | DATETIME | |

#### `payment_events` (webhook log)
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| payment_link_id | BIGINT FK | |
| event_type | VARCHAR(60) | payment.success / payment.failed |
| amount_received | DECIMAL(12,2) | |
| payment_method | VARCHAR(30) | juice/card/bank_transfer |
| mips_reference | VARCHAR(100) | |
| raw_payload | JSON | Full webhook body |
| received_at | DATETIME | |

#### `communications`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| client_id | BIGINT FK | |
| renewal_id | BIGINT FK | NULL if standalone |
| appointment_id | BIGINT FK | NULL if not appointment-related |
| channel | ENUM | email/whatsapp/sms/in_app |
| direction | ENUM | outbound/inbound |
| template_key | VARCHAR(60) | renewal_j45/appt_confirm/etc. |
| subject | VARCHAR(255) | Email subject |
| body | TEXT | Rendered message body |
| status | ENUM | queued/sent/delivered/failed/read |
| sent_at | DATETIME | |
| delivered_at | DATETIME | |
| read_at | DATETIME | |
| error_detail | TEXT | |
| created_at | DATETIME | |

#### `documents`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| client_id | BIGINT FK | |
| policy_id | BIGINT FK | NULL if client-level doc |
| appointment_id | BIGINT FK | NULL |
| uploaded_by_agent_id | BIGINT FK | |
| document_type | ENUM | policy_schedule/cover_note/inspection_report/claim_form/id_copy/other |
| filename | VARCHAR(255) | |
| storage_path | VARCHAR(500) | S3/local path |
| file_size_bytes | INT UNSIGNED | |
| mime_type | VARCHAR(100) | |
| is_confidential | TINYINT(1) | Restricts to admin only |
| uploaded_at | DATETIME | |

#### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| actor_user_id | BIGINT FK | |
| actor_ip | VARCHAR(45) | |
| entity_type | VARCHAR(60) | policy/client/renewal/payment |
| entity_id | BIGINT | |
| action | VARCHAR(60) | created/updated/deleted/status_changed |
| old_values_json | JSON | Before state |
| new_values_json | JSON | After state |
| occurred_at | DATETIME | |

#### `notification_templates`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| template_key | VARCHAR(60) | Unique identifier |
| channel | ENUM | email/whatsapp/sms |
| language | ENUM | en/fr |
| subject | VARCHAR(255) | Email only |
| body_template | TEXT | Handlebars/Twig syntax |
| variables_json | JSON | Expected variables list |
| is_active | TINYINT(1) | |

---

## 7. Screen List

### 7.1 Authentication & Setup
| # | Screen | Role |
|---|---|---|
| A1 | Login | All |
| A2 | Register brokerage (onboarding wizard) | Admin |
| A3 | Agent invite & account setup | Agent |
| A4 | MIPS credentials configuration | Admin |
| A5 | WhatsApp Business setup | Admin |

### 7.2 Dashboard
| # | Screen | Role |
|---|---|---|
| D1 | Main dashboard — KPIs, renewal pipeline, upcoming appointments, revenue at risk | Admin/Agent |
| D2 | Manager overview — all agents' pipelines, team leaderboard | Admin |

### 7.3 Client CRM
| # | Screen | Role |
|---|---|---|
| C1 | Client list (search, filter by agent/policy type/status) | Admin/Agent |
| C2 | Client profile — details, policies, communications, documents | Admin/Agent |
| C3 | Add / Edit client | Admin/Agent |
| C4 | Client communication history timeline | Admin/Agent |

### 7.4 Policy Management
| # | Screen | Role |
|---|---|---|
| P1 | Policy list (filter by status/expiry/insurer/type) | Admin/Agent |
| P2 | Policy detail — full lifecycle, linked renewals, payment history, documents | Admin/Agent |
| P3 | Add / Edit policy | Admin/Agent |
| P4 | Policy document upload | Admin/Agent |
| P5 | Lapsed policies — recovery pipeline | Admin |

### 7.5 Appointments & Booking
| # | Screen | Role |
|---|---|---|
| B1 | Appointment calendar (week/month view) | Admin/Agent |
| B2 | Book appointment (type, format, slot selection) | Admin/Agent |
| B3 | Appointment detail — pre/post notes, report upload | Admin/Agent |
| B4 | Client-facing booking page (public, no login) | Client |

### 7.6 Payments
| # | Screen | Role |
|---|---|---|
| M1 | Generate MIPS payment link (amount, description, expiry) | Admin/Agent |
| M2 | Payment link list — status, share options | Admin/Agent |
| M3 | Payment history per policy | Admin/Agent |
| M4 | Revenue dashboard — commissions, paid vs pending | Admin |

### 7.7 Renewal Pipeline
| # | Screen | Role |
|---|---|---|
| R1 | Renewal pipeline kanban (J-45 → Paid columns) | Admin/Agent |
| R2 | Renewal detail — trigger history, messages sent, payment link | Admin/Agent |
| R3 | Renewal message preview & manual send | Admin/Agent |
| R4 | Automation settings (enable/disable triggers, edit templates) | Admin |

### 7.8 Settings
| # | Screen | Role |
|---|---|---|
| S1 | Brokerage profile & FSC details | Admin |
| S2 | Agent management (invite, roles, deactivate) | Admin |
| S3 | Notification templates (email + WhatsApp, EN/FR) | Admin |
| S4 | MIPS API configuration | Admin |
| S5 | Calendar & working hours setup | Agent |
| S6 | Audit log viewer | Admin |

---

## 8. Automation Logic

### 8.1 Renewal Trigger Engine

```
Cron: daily at 08:00 (Africa/Mauritius timezone)

STEP 1 — Identify expiring policies
    SELECT p.*, r.id AS renewal_id
    FROM policies p
    LEFT JOIN renewals r ON r.policy_id = p.id AND r.renewal_year = YEAR(p.end_date)
    WHERE p.status = 'active'
      AND p.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 45 DAY)
      AND (r.id IS NULL OR r.status = 'pending')

STEP 2 — For each policy, evaluate which trigger applies:
    IF end_date = CURDATE() + 45 AND j45_sent_at IS NULL → TRIGGER J45
    IF end_date = CURDATE() + 30 AND j30_sent_at IS NULL → TRIGGER J30
    IF end_date = CURDATE() + 15 AND j15_sent_at IS NULL → TRIGGER J15
    IF end_date = CURDATE()      AND j0_sent_at  IS NULL → TRIGGER J0

STEP 3 — For each trigger:
    a) Create or update renewal record
    b) Call MIPS API → generate payment link → store in payment_links
    c) Render message template (language = client.language_pref)
    d) Dispatch email via SMTP queue
    e) Dispatch WhatsApp via WA Business API
    f) Update renewal.jXX_sent_at = NOW()
    g) Write communication record
    h) Write audit_log entry

STEP 4 — J0 special handling:
    a) Set policy.status = 'lapsed'
    b) Notify assigned agent (high-priority in-app + email)
    c) Notify brokerage admin
    d) Surface on D2 manager dashboard
```

### 8.2 Appointment Reminder Engine

```
Cron: daily at 07:00

    SELECT * FROM appointments
    WHERE status = 'scheduled'
      AND scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)
      AND reminder_sent = 0

    For each appointment:
        → Render reminder template
        → Dispatch email + WhatsApp to client
        → If video appointment: include video_link in message
        → Set appointments.reminder_sent = 1
        → Write communication record
```

### 8.3 Payment Webhook Handler

```
POST /webhook/mips (HMAC-verified)

    1. Verify MIPS signature (HMAC-SHA256 on raw body)
    2. Log raw payload to payment_events
    3. Find payment_link by mips_transaction_ref
    4. If event_type = 'payment.success':
        a) Set payment_link.status = 'paid', paid_at = NOW()
        b) Set linked renewal.status = 'paid', completed_at = NOW()
        c) Set policy.status = 'active' (if it was lapsed/pending)
        d) Create new policy period record (start = old end + 1 day)
        e) Cancel any pending renewal reminder jobs
        f) Send receipt email to client
        g) Notify agent (in-app)
        h) Write audit_log
    5. If event_type = 'payment.failed':
        a) Set payment_link.status = 'failed'
        b) Notify agent
        c) Log for retry
    6. Return HTTP 200 (MIPS expects acknowledgement)
```

### 8.4 Communication Queue Architecture

```
All outbound messages flow through a queue (Redis or DB-backed):

Producer → [communication_queue table] → Consumer worker (cron every 2 min)
    → Email: PHPMailer/Sendgrid SMTP
    → WhatsApp: Meta Cloud API (WhatsApp Business)
    → On failure: retry 3x with exponential backoff → mark failed → alert admin
    → Delivery receipts fed back via webhook → update communications.delivered_at
```

---

## 9. AI Module Roadmap

### Phase 1 — Rule-Based Quote Engine (Days 91–150)

**Mechanism:** Structured form + manual insurer rate tables maintained by brokerage admin.

```
Input:  client profile + asset details (vehicle/property)
Process: Apply each insurer's pricing formula (hardcoded or rate table)
Output: 3 quotes ranked by premium, with coverage summary
```

**Value delivered:** Broker saves 45 min per quote. Quote accuracy depends on rate table freshness.

---

### Phase 2 — Insurer API Integration (Days 151–240)

**Mechanism:** Direct REST/SOAP integration with insurer portals (SWAN ePortal, MUA digital, Jubilee API).

```
Input:  Standardised quote request payload
Process: Parallel API calls to 3–5 insurers
Output: Live quotes with real-time pricing and cover details
Fallback: Rate table if API unavailable
```

**Compliance note:** Requires data processing agreements with each insurer.

---

### Phase 3 — LLM-Assisted Recommendation Engine (Days 241–365)

**Mechanism:** Claude API (`claude-sonnet-4-6` or newer) as reasoning layer.

```
Input:
    - Client risk profile (age, claims history, asset value, location)
    - Historical renewal acceptance rates per client segment
    - Current insurer quotes
    - Client's stated priorities (lowest premium / best cover / known insurer)

Prompt design:
    "Given this client profile and these 5 quotes, rank them by overall
     value for a Mauritian client with these priorities: [priorities].
     Explain the top recommendation in 2 sentences in [language].
     Flag any coverage gaps."

Output:
    - Ranked quotes with AI rationale
    - Coverage gap warnings
    - Suggested upsell (e.g., "add personal accident cover for MUR 1,200/yr")
    - Personalised renewal message draft
```

**Guardrails:**
- AI recommendation is advisory only; broker must approve before dispatch.
- All AI outputs logged to `ai_recommendations` table with prompt, response, model version.
- Broker can override ranking; override reason captured.
- Disclosure to client: "This recommendation was prepared with AI assistance and reviewed by your broker."

---

### Phase 4 — Predictive Lapse Scoring (Post-MVP)

```
Model: Gradient Boosted Trees trained on:
    - Days-to-pay history per client
    - Previous lapse events
    - Communication open rates
    - Payment method (Juice users pay faster than bank transfer)
    - Policy type (motor lapses more than life)

Output: Lapse probability score (0–100) per client per renewal
Use: Prioritise high-risk renewals for personal broker outreach
     Adjust trigger timing (high-risk → J-60 instead of J-45)
```

---

## 10. Risk & Compliance Considerations

### 10.1 Regulatory Framework (Mauritius)

| Regulation | Implication | Mitigation |
|---|---|---|
| **Insurance Act 2005** | Brokers must hold FSC licence; platform cannot act as insurer | Store FSC number, block unbounded brokerage creation |
| **Financial Services Act 2007** | Conduct rules for intermediaries; records must be kept 7 years | Audit log with 7-year retention, export function |
| **Data Protection Act 2017 (DPA)** | Personal data processing requires consent and purpose limitation | Consent flag on client record, privacy notice on booking pages |
| **MIPS Payment Rules** | Merchant must be registered; PCI-DSS applies to card data | MIPS API handles card data; platform never stores card details |
| **AML/CFT** | Insurance is listed sector; brokers have CDD obligations | NIC number field, client risk flag, suspicious activity note field |
| **FSC Conduct Guidelines** | Best-interest duty on recommendations | AI recommendation advisory-only, broker sign-off required |

### 10.2 Data Security

| Risk | Control |
|---|---|
| MIPS API keys exposed | Encrypted at rest (AES-256), never in client-side code, separate secrets manager |
| WhatsApp message interception | WA Business API uses TLS; message content logged but access-controlled |
| Client PII breach | Role-based access, field-level encryption for NIC/DOB, HTTPS enforced |
| Webhook spoofing | HMAC-SHA256 verification on all MIPS webhooks; IP allowlist |
| Multi-tenant data leak | Brokerage_id enforced at query level on every data access, never in URL |
| Session hijacking | Existing session controls (30-min idle timeout, secure/httponly cookies) |

### 10.3 Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MIPS API downtime | Medium | High | Retry queue + manual link fallback + status page |
| WhatsApp API rate limits | Low | Medium | Message queue with rate limiter, fallback to email |
| Cron job failure (missed renewals) | Low | High | Job monitoring, dead-letter alerts, manual trigger UI |
| Broker misconfigures premium amount | Medium | Medium | Confirmation step before link generation, audit log |
| Client data used for AI training | Medium | High | Contractual prohibition; local inference or anonymisation |

### 10.4 Insurance-Specific Risks

- **Coverage gap liability:** If automation fails and a client lapses, broker could be blamed. Mitigate with clear terms of service: platform is a tool, broker retains duty of care.
- **AI quote accuracy:** Incorrect AI quote could constitute mis-selling. Mitigate: broker review gate mandatory before client dispatch; disclaimer on all quote communications.
- **Commission disclosure:** DPA + FSC rules require commission transparency. Add commission disclosure field to policy record and include in client communications.

---

## 11. 90-Day Implementation Roadmap

### Sprint Structure: 2-week sprints, 6 sprints total

---

#### DAYS 1–14 | Sprint 1: Foundation & Domain Model

**Goal:** Working dev environment, extended schema, auth hardened for multi-tenancy.

| Task | Owner | Days |
|---|---|---|
| Set up staging environment (Linux/Nginx/MariaDB) | DevOps | 1–2 |
| Extend schema: all tables in Section 6 | Backend | 1–5 |
| Seed data: 5 insurers, product types, test clients | Backend | 4–5 |
| Multi-tenancy: brokerage_id enforcement layer | Backend | 5–10 |
| Role-based access control (admin/agent/readonly) | Backend | 8–12 |
| Brokerage onboarding wizard (A2) | Frontend | 8–14 |
| Agent invite flow (A3) | Backend+Frontend | 10–14 |

**Exit criteria:** Admin can register a brokerage, invite an agent, both can log in with correct role isolation.

---

#### DAYS 15–28 | Sprint 2: Client CRM & Policy Management

**Goal:** Broker can manage their full client and policy book.

| Task | Owner | Days |
|---|---|---|
| Client CRUD (C1, C2, C3) | Full-stack | 15–20 |
| Policy CRUD with insurer/product selection (P1, P2, P3) | Full-stack | 18–25 |
| Document upload (S3-compatible storage) | Backend | 22–26 |
| Audit log integration on all writes | Backend | 24–28 |
| Renewal record auto-creation on policy save | Backend | 26–28 |

**Exit criteria:** Broker can create a client, add a motor policy, upload a policy schedule PDF; renewal record auto-created with correct J-45/30/15 dates.

---

#### DAYS 29–42 | Sprint 3: Appointment Booking

**Goal:** Fully functional appointment booking, confirmation, and reminder.

| Task | Owner | Days |
|---|---|---|
| Agent calendar configuration (S5) | Frontend | 29–32 |
| Appointment booking form (B2) | Full-stack | 30–36 |
| Calendar view (B1) | Frontend | 33–38 |
| Email confirmation (SMTP) | Backend | 35–38 |
| WhatsApp confirmation (WA Business API) | Backend | 36–40 |
| Day-before reminder cron (8.2) | Backend | 38–42 |
| Client-facing public booking page (B4) | Frontend | 38–42 |

**Exit criteria:** Broker books inspection; client gets email + WhatsApp with calendar invite; day-before reminder fires automatically.

---

#### DAYS 43–56 | Sprint 4: MIPS Payment Integration

**Goal:** Broker can generate, share, and track MIPS payment links.

| Task | Owner | Days |
|---|---|---|
| MIPS API client library | Backend | 43–46 |
| Payment link generation UI (M1, M2) | Full-stack | 44–50 |
| Webhook endpoint + HMAC verification (8.3) | Backend | 48–52 |
| Payment status sync to policy/renewal | Backend | 50–54 |
| Receipt email on payment success | Backend | 52–54 |
| Payment history view (M3) | Frontend | 53–56 |

**Exit criteria:** Broker generates MIPS link; simulated webhook fires; policy status updates; client receives receipt email.

---

#### DAYS 57–70 | Sprint 5: Renewal Automation

**Goal:** End-to-end automated renewal pipeline operational.

| Task | Owner | Days |
|---|---|---|
| Renewal pipeline kanban (R1) | Frontend | 57–62 |
| Renewal detail view (R2) | Frontend | 60–64 |
| Notification template editor (S3) | Full-stack | 60–65 |
| Renewal trigger cron engine (8.1) | Backend | 60–68 |
| Communication queue (8.4) | Backend | 63–68 |
| Manual send override (R3) | Frontend | 65–68 |
| Automation toggle settings (R4) | Frontend | 66–70 |

**Exit criteria:** J-45 cron runs in staging; test client receives email + WhatsApp with MIPS link; renewal status progresses on dashboard.

---

#### DAYS 71–90 | Sprint 6: Dashboard, Hardening & Launch

**Goal:** Production-ready platform; first 5 brokers onboarded.

| Task | Owner | Days |
|---|---|---|
| Main dashboard KPIs (D1) | Full-stack | 71–76 |
| Manager dashboard (D2) | Full-stack | 74–78 |
| Revenue dashboard (M4) | Full-stack | 75–79 |
| Audit log viewer (S6) | Frontend | 76–80 |
| Security review (OWASP Top 10, PCI scope) | Security | 78–82 |
| Performance testing (load test renewal cron) | QA | 80–84 |
| FSC compliance checklist sign-off | Legal/Product | 82–85 |
| Production deployment (HTTPS, backups, monitoring) | DevOps | 83–87 |
| First broker pilot onboarding (2–3 brokers) | Product | 85–90 |
| Documentation + training materials | Product | 86–90 |

**Exit criteria:** 3 pilot brokers live, at least 50 policies imported, first automated renewal message sent to real client.

---

## 12. Pricing Model for Brokers

### 12.1 Rationale

The pricing must reflect the value proposition clearly: **InsurLink MU saves time and recovers lapsed-policy revenue**. A broker losing even 5% of their book to lapses on MUR 10M premium = MUR 500k lost revenue. The platform must cost a fraction of that.

---

### 12.2 Tier Structure

#### Tier 1 — Starter (Solo Broker)
**MUR 1,500 / month** (or MUR 15,000/year — 2 months free)

| Included | Limit |
|---|---|
| Agent seats | 1 |
| Active policies | Up to 100 |
| Renewal automations | Included |
| MIPS payment links | 50/month |
| Appointment booking | Included |
| Email notifications | Included |
| WhatsApp | Not included |
| AI quotes | Not included |

---

#### Tier 2 — Growth (Small Team)
**MUR 4,500 / month** (or MUR 45,000/year)

| Included | Limit |
|---|---|
| Agent seats | Up to 5 |
| Active policies | Up to 500 |
| Renewal automations | Included |
| MIPS payment links | 300/month |
| Appointment booking | Included |
| Email notifications | Included |
| WhatsApp notifications | Included |
| Manager dashboard | Included |
| AI quotes | Not included |
| Priority support | Included |

---

#### Tier 3 — Pro (Full Brokerage)
**MUR 10,000 / month** (or MUR 100,000/year)

| Included | Limit |
|---|---|
| Agent seats | Up to 15 |
| Active policies | Unlimited |
| Renewal automations | Included |
| MIPS payment links | Unlimited |
| Appointment booking | Included |
| Email + WhatsApp | Included |
| Manager dashboard | Included |
| AI quote comparison | Included (Phase 2) |
| Custom templates | Included |
| API access | Included |
| Dedicated onboarding | Included |
| SLA | 4-hour response |

---

#### Add-ons (All Tiers)

| Add-on | Price |
|---|---|
| Extra agent seat | MUR 800/seat/month |
| Extra MIPS links (block of 100) | MUR 500 |
| WhatsApp on Starter | MUR 1,000/month |
| Custom insurer rate table upload | MUR 2,500 one-off |
| AI quote module (when available) | MUR 3,000/month |

---

### 12.3 Transaction Model (Alternative/Hybrid)

For brokers resistant to SaaS subscriptions, offer a **freemium + transaction** option:

- **Free tier:** 20 policies, 5 MIPS links/month.
- **Transaction fee:** MUR 25 per MIPS payment link that results in a confirmed payment.
- Convert to subscription when transaction fees exceed Starter tier cost (~60 paid payments/month).

This lowers the adoption barrier and creates a natural upsell trigger.

---

### 12.4 Unit Economics Projection (12 months)

| Metric | Conservative | Optimistic |
|---|---|---|
| Paid brokerages (Month 12) | 20 | 50 |
| Avg MRR per brokerage | MUR 4,500 | MUR 6,000 |
| MRR at Month 12 | MUR 90,000 | MUR 300,000 |
| ARR at Month 12 | MUR 1.08M | MUR 3.6M |
| Gross margin (SaaS) | ~75% | ~80% |

---

## Appendix A: Suggested Tech Stack

| Layer | Recommended | Notes |
|---|---|---|
| Backend | PHP 8.2 (existing) | Extend with service layer pattern |
| Frontend | Alpine.js + Tailwind CSS | Lightweight, mobile-first |
| Database | MariaDB 10.11 (existing) | Add Redis for queue |
| Queue | Database-backed queue → Redis | Redis when volume demands |
| Email | Sendgrid / Brevo | Deliverability + analytics |
| WhatsApp | Meta Cloud API (WhatsApp Business) | Direct, no reseller markup |
| File Storage | Scaleway Object Storage (EU/Mauritius) | GDPR-friendly |
| Cron | systemd timers or Supervisor | Reliable, monitorable |
| Monitoring | Uptime Kuma + Sentry | Open-source, self-hostable |
| AI (Phase 2) | Anthropic Claude API | claude-sonnet-4-6 for cost/quality balance |

---

## Appendix B: Insurer Coverage Matrix

| Insurer | Motor | Property | Life | Health | Liability | Marine | Fleet |
|---|---|---|---|---|---|---|---|
| SWAN Insurance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| MUA Insurance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Jubilee Insurance | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| CIM Finance | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Anglo-Mauritius (AML) | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| BAI Co (Bramer) | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |

*To be validated with each insurer's product team during Phase 2 API integration.*

---

*Document version: 1.0 | Prepared for: Board / Technical review*
*Classification: Confidential — InsurLink MU*
