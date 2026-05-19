# MCard MVP — Complete Product Specification
**Prepared by:** MIPS Product & Architecture Team  
**Document version:** 1.0 — MVP Edition  
**Date:** May 2026  
**Classification:** Internal — Confidential

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Strategic Positioning](#2-strategic-positioning)
3. [User Personas](#3-user-personas)
4. [User Journeys](#4-user-journeys)
5. [UX Flows](#5-ux-flows)
6. [Mobile App Navigation](#6-mobile-app-navigation)
7. [Core Screens & Screen-by-Screen Behaviour](#7-core-screens--screen-by-screen-behaviour)
8. [Backend Architecture](#8-backend-architecture)
9. [API Architecture](#9-api-architecture)
10. [Database Schema](#10-database-schema)
11. [Payment Routing Logic](#11-payment-routing-logic)
12. [QR Payment Logic](#12-qr-payment-logic)
13. [Push2Phone Flow](#13-push2phone-flow)
14. [Loyalty Engine Logic](#14-loyalty-engine-logic)
15. [Merchant-Side Logic](#15-merchant-side-logic)
16. [Security & PCI Considerations](#16-security--pci-considerations)
17. [Tokenization Approach](#17-tokenization-approach)
18. [OTP Authentication Logic](#18-otp-authentication-logic)
19. [Scalability Considerations](#19-scalability-considerations)
20. [Suggested Tech Stack](#20-suggested-tech-stack)
21. [Flutter vs React Native](#21-flutter-vs-react-native)
22. [Backend Stack](#22-backend-stack)
23. [Cloud Architecture](#23-cloud-architecture)
24. [DevOps Architecture](#24-devops-architecture)
25. [Fraud & Abuse Considerations](#25-fraud--abuse-considerations)
26. [KYC Considerations](#26-kyc-considerations)
27. [Future Roadmap](#27-future-roadmap)
28. [Monetization Opportunities](#28-monetization-opportunities)
29. [Competitive Positioning in Mauritius](#29-competitive-positioning-in-mauritius)
30. [Competitive Differentiation](#30-competitive-differentiation)
31. [Risks & Constraints](#31-risks--constraints)
32. [Go-to-Market Recommendations](#32-go-to-market-recommendations)
33. [Suggested MVP Timeline](#33-suggested-mvp-timeline)
34. [Suggested Team Structure](#34-suggested-team-structure)
35. [Suggested KPIs](#35-suggested-kpis)

---

## 1. Product Vision

### 1.1 One-sentence definition

MCard is the unified consumer payment and loyalty companion that lets any Mauritian pay with any rail, earn across any merchant, and never wonder which app to use — powered by MIPS orchestration.

### 1.2 Problem statement

Consumers in Mauritius carry a fragmented payment ecosystem:

| Problem | Reality today |
|---|---|
| Multiple payment apps | Juice, POP, my.t money, blink, MCB Juice, etc. |
| Multiple loyalty programmes | Each merchant runs a separate card or app |
| No unified QR experience | Different QR standards per rail |
| Push2Phone routing confusion | Consumer does not control which app receives a push payment |
| No single transaction history | History split across every banking and wallet app |

Merchants face the mirror problem:

| Problem | Reality today |
|---|---|
| Accepting multiple rails means multiple terminals or integrations | Costly and complex |
| No unified loyalty issuance | Must build loyalty separately per channel |
| No real-time consumer preference signal | Cannot know which rail a consumer prefers |

MIPS already solves the merchant and acquirer side through its orchestration platform. MCard is the consumer face of that same infrastructure.

### 1.3 What MCard is NOT

- Not a bank or neobank
- Not a stored-value wallet issuing MRU balances
- Not a crypto wallet
- Not a replacement for Juice, POP, my.t money, or blink
- Not a card issuer
- Not a banking super-app

### 1.4 What MCard IS

- A **payment routing companion**: routes QR and Push2Phone to the right rail at the right moment
- A **loyalty aggregation layer**: single view of points across merchants, rails-agnostic
- A **preference manager**: consumer controls how and where they want to pay and be pushed to
- A **MIPS-connected consumer endpoint**: bridges MIPS orchestration to the consumer's mobile phone

### 1.5 Vision statement

> MCard turns the complexity of the Mauritian payment landscape into a single, effortless consumer experience — while giving MIPS a direct consumer touchpoint across every payment rail it orchestrates.

---

## 2. Strategic Positioning

### 2.1 Market context

Mauritius has a small but sophisticated payment ecosystem. Key dynamics:

| Factor | Detail |
|---|---|
| Population | ~1.3 million |
| Smartphone penetration | ~75% |
| Active Juice users | Estimated 400k+ |
| Active my.t money users | Growing base post-MyT merger |
| POP | Bank of Mauritius-driven national rails |
| blink | MCB's own consumer wallet |
| Card penetration | High — Visa/Mastercard across all major banks |
| QR adoption | Growing but fragmented per rail |
| Bank of Mauritius posture | Pro-interoperability, POP mandate |

### 2.2 Where MIPS sits

MIPS is the payment orchestration layer connecting:
- Merchant POS terminals and online checkouts
- Acquirer banks
- Payment rails (POP, Juice, my.t money, card schemes)

MIPS processes the transaction; MCard is the consumer-side app that gives consumers control and visibility over those transactions.

### 2.3 Positioning matrix

```
                    RAIL-SPECIFIC          RAIL-AGNOSTIC
                  ┌──────────────────┬────────────────────────┐
  PAYMENT ONLY    │  Juice / blink   │      MCard (MVP)       │
                  │  my.t money      │                        │
  ─────────────── ├──────────────────┼────────────────────────┤
  PAYMENT +       │  (none today)    │   MCard (full vision)  │
  LOYALTY +       │                  │                        │
  ORCHESTRATION   │                  │                        │
                  └──────────────────┴────────────────────────┘
```

MCard occupies an uncontested position: rail-agnostic, orchestration-backed, loyalty-aggregating.

### 2.4 Strategic rationale for MIPS

| Benefit | Description |
|---|---|
| Consumer data | Direct consumer touchpoint — MIPS currently has no consumer-facing data |
| Loyalty revenue | Opportunity to charge merchants per loyalty point issued through MCard |
| Routing intelligence | Consumer preferences feed back into MIPS orchestration engine |
| Push2Phone control | Consumer tells MIPS where to route — reduces failed Push2Phone events |
| Brand visibility | MIPS becomes visible to end consumers, not just banks and merchants |

---

## 3. User Personas

### Persona 1 — Priya, the urban professional (Primary)

| Attribute | Detail |
|---|---|
| Age | 28 |
| Location | Port Louis |
| Occupation | Marketing executive |
| Devices | iPhone 14, Mac |
| Payment apps | Juice, MCB tap card |
| Pain points | Has to choose which app to open at checkout; misses loyalty points; confused by QR |
| Goal | Pay fast, earn points, see history in one place |
| Tech savviness | High |

### Persona 2 — Ravi, the small business owner (Secondary, also Merchant)

| Attribute | Detail |
|---|---|
| Age | 42 |
| Location | Quatre Bornes |
| Occupation | Runs a restaurant |
| Devices | Android mid-range |
| Payment apps | POP (for receiving), personal Juice |
| Pain points | Customers ask "which QR?"; loyalty is just a paper stamp card |
| Goal | Accept any payment, give loyalty digitally, see who pays regularly |
| Tech savviness | Medium |

### Persona 3 — Kevin, the value-conscious shopper (Primary)

| Attribute | Detail |
|---|---|
| Age | 22 |
| Location | Vacoas |
| Occupation | University student |
| Devices | Android budget phone |
| Payment apps | my.t money (family plan) |
| Pain points | Never knows his loyalty balances; only has my.t money |
| Goal | Pay with my.t money everywhere, accumulate loyalty points, redeem easily |
| Tech savviness | Medium-High |

### Persona 4 — Marie, the retiree (Tertiary)

| Attribute | Detail |
|---|---|
| Age | 63 |
| Location | Mahebourg |
| Occupation | Retired civil servant |
| Devices | Android, older model |
| Payment apps | Bank debit card |
| Pain points | QR codes are confusing; paper loyalty cards get lost |
| Goal | Tap or scan to pay with her card, see her history |
| Tech savviness | Low |

---

## 4. User Journeys

### Journey 1 — First-time onboarding

```
User downloads MCard
        │
        ▼
Enter mobile number
        │
        ▼
Receive OTP via SMS
        │
        ▼
Verify OTP
        │
        ▼
Set display name + avatar (optional)
        │
        ▼
Link first payment method
        │   ├── Add bank card (PAN entry or card scan)
        │   ├── Link Juice number
        │   ├── Link POP number
        │   ├── Link my.t money number
        │   └── Link blink number
        │
        ▼
Configure Push2Phone preference (can skip)
        │
        ▼
Home screen — ready to pay
```

### Journey 2 — QR payment at merchant

```
Consumer at checkout
        │
        ▼
Open MCard → tap QR icon
        │
        ▼
Camera opens — scan merchant QR
        │
        ▼
MIPS resolves QR → merchant details shown
        │
        ▼
Consumer enters amount (if QR is static)
OR amount pre-filled (if QR is dynamic)
        │
        ▼
Choose payment method
  ├── Use preferred (default)
  ├── Card ending in XXXX
  ├── Juice – 5XXXXXXX
  ├── POP – 5XXXXXXX
  ├── my.t money – 5XXXXXXX
  └── blink – XXXXXXX
        │
        ▼
Confirm payment
        │
        ▼
MIPS processes transaction via selected rail
        │
        ▼
Result screen:
  ✓ Success + loyalty points earned
  ✗ Failure + reason + retry option
        │
        ▼
Notification sent to consumer
Transaction logged in history
Loyalty wallet updated
```

### Journey 3 — Push2Phone payment received

```
Merchant initiates Push2Phone via MIPS
        │
        ▼
MIPS resolves consumer's Push2Phone preference
        │
        ▼
Consumer receives push notification on MCard
        │
        ▼
Notification shows:
  - Merchant name
  - Amount
  - Rail it will be sent to (e.g. Juice)
        │
        ▼
Consumer taps notification → MCard opens
        │
        ▼
Payment request screen:
  - Merchant name + logo
  - Amount
  - Rail
  - [Approve] [Decline] [Change method]
        │
        ▼
Consumer approves
        │
        ▼
MIPS triggers rail-specific Push2Phone
        │
        ▼
Result screen + loyalty points
```

### Journey 4 — View loyalty points

```
Open MCard → tap Loyalty tab
        │
        ▼
Loyalty wallet summary:
  - Total points value (in MRU equivalent or points)
  - Top merchant tiles
        │
        ▼
Tap merchant tile
        │
        ▼
Merchant loyalty profile:
  - Points balance at this merchant
  - Points history (earned / redeemed)
  - Tier status (if applicable)
  - Active offers
        │
        ▼
Tap "Redeem" → QR code generated for merchant POS
OR redemption handled automatically at next payment
```

### Journey 5 — Manage Push2Phone preferences

```
Settings → Push2Phone Preferences
        │
        ▼
Global default preference (which rail)
        │
        ▼
Per-merchant overrides list:
  - Merchant A → Juice 5XXXXXXX
  - Merchant B → POP 5XXXXXXX
  - All others → Default
        │
        ▼
Add merchant override:
  - Search or scan merchant QR
  - Select rail
  - Save
```

---

## 5. UX Flows

### 5.1 Authentication flow

```
┌─────────────────────────────────────────┐
│         SPLASH / LANDING SCREEN         │
│                                         │
│  [MCard logo]                           │
│  "Your payments, unified."              │
│                                         │
│  [Get Started]  [I already have MCard]  │
└─────────────────┬───────────────────────┘
                  │
          ┌───────▼────────┐
          │  PHONE NUMBER  │
          │  ENTRY SCREEN  │
          │                │
          │ +230 [_______] │
          │  [Send OTP]    │
          └───────┬────────┘
                  │ SMS OTP sent
          ┌───────▼────────┐
          │   OTP SCREEN   │
          │                │
          │ [_][_][_][_]   │
          │ (6-digit code) │
          │ [Verify]       │
          │ Resend in 0:30 │
          └───────┬────────┘
                  │
         New user?│    Returning user?
         ┌────────▼──────┐  ┌──────────────────┐
         │PROFILE SETUP  │  │ HOME SCREEN      │
         │(name, avatar) │  │ (already authed) │
         └────────┬──────┘  └──────────────────┘
                  │
         ┌────────▼──────────┐
         │  LINK PAYMENT     │
         │  METHODS SCREEN   │
         └────────┬──────────┘
                  │
         ┌────────▼──────────┐
         │  HOME SCREEN      │
         └───────────────────┘
```

### 5.2 QR scan payment flow

```
HOME → [Scan QR]
        │
  ┌─────▼──────────────────────────┐
  │  QR SCANNER SCREEN             │
  │  Camera viewfinder             │
  │  [Upload from Gallery]         │
  └─────┬──────────────────────────┘
        │ QR detected
        │
  ┌─────▼──────────────────────────┐
  │  MERCHANT CONFIRMATION SCREEN  │
  │  Logo + Name                   │
  │  Address                       │
  │  Amount: [dynamic or entry]    │
  │  [Continue] [Cancel]           │
  └─────┬──────────────────────────┘
        │
  ┌─────▼──────────────────────────┐
  │  PAYMENT METHOD SELECTION      │
  │  ★ Default: Visa ••4321        │
  │  ○ Juice 5XXXXXXX              │
  │  ○ POP 5XXXXXXX                │
  │  ○ my.t money 5XXXXXXX         │
  │  ○ blink XXXXXXX               │
  └─────┬──────────────────────────┘
        │
  ┌─────▼──────────────────────────┐
  │  PAYMENT CONFIRMATION          │
  │  Merchant: [Name]              │
  │  Amount: MRU XXX.XX            │
  │  Method: Visa ••4321           │
  │  [Slide to Pay]                │
  └─────┬──────────────────────────┘
        │
  ┌─────▼──────────────────────────┐
  │  PROCESSING SCREEN             │
  │  Animated spinner              │
  └─────┬──────────────────────────┘
        │
  ┌─────▼──────────────────────────┐
  │  RESULT SCREEN                 │
  │  ✓ Payment Successful          │
  │  MRU 250.00 to [Merchant]      │
  │  +50 loyalty points earned     │
  │  [View Receipt] [Go Home]      │
  └────────────────────────────────┘
```

### 5.3 Push2Phone approval flow

```
[Push Notification arrives]
        │
  ┌─────▼───────────────────────────┐
  │  PUSH2PHONE REQUEST SCREEN      │
  │                                 │
  │  [Merchant Logo]                │
  │  "Pizza Palace" requests        │
  │  MRU 450.00                     │
  │                                 │
  │  Will be charged to:            │
  │  Juice – 5712XXXX               │
  │                                 │
  │  [Change method ▼]              │
  │                                 │
  │  [✗ Decline]   [✓ Approve]     │
  └─────┬───────────────────────────┘
        │ Approve
  ┌─────▼───────────────────────────┐
  │  Biometric / PIN confirm        │
  └─────┬───────────────────────────┘
        │
  ┌─────▼───────────────────────────┐
  │  RESULT SCREEN (same as QR)     │
  └─────────────────────────────────┘
```

---

## 6. Mobile App Navigation

### 6.1 Navigation structure (bottom tab bar)

```
┌──────────────────────────────────────────────────┐
│                  [Header: MCard]                 │
│                                                  │
│                  [Screen Content]                │
│                                                  │
│                                                  │
│                                                  │
├──────────┬────────┬──────────┬────────┬──────────┤
│  [Home]  │ [Scan] │[Loyalty] │[History]│[Settings]│
│   🏠     │  📷   │   ⭐     │   📋   │   ⚙️    │
└──────────┴────────┴──────────┴────────┴──────────┘
```

### 6.2 Screen map

```
MCard App
├── Home
│   ├── Wallet summary card (total linked methods)
│   ├── Push2Phone incoming requests (badge)
│   ├── Recent transactions (3 items)
│   └── Quick-pay shortcuts (Scan, Request money — future)
│
├── Scan (QR)
│   ├── Camera scanner
│   ├── Gallery import
│   └── Payment flow (modal stack)
│
├── Loyalty
│   ├── Total points summary
│   ├── Merchant tiles grid
│   └── Merchant detail → points history + offers
│
├── History
│   ├── Transaction list (filterable by date, rail, merchant)
│   └── Transaction detail → receipt + loyalty earned
│
└── Settings
    ├── Profile
    │   ├── Name / avatar
    │   └── Phone number (read-only)
    ├── Linked Payment Methods
    │   ├── Cards (add / remove)
    │   ├── Juice number (add / remove)
    │   ├── POP number (add / remove)
    │   ├── my.t money number (add / remove)
    │   └── blink number (add / remove)
    ├── Push2Phone Preferences
    │   ├── Global default
    │   └── Per-merchant overrides
    ├── Notifications
    │   ├── Push2Phone alerts
    │   ├── Transaction confirmations
    │   └── Promotional (optional)
    ├── Security
    │   ├── Biometric toggle
    │   ├── PIN change
    │   └── Active sessions
    └── About / Help / Logout
```

---

## 7. Core Screens & Screen-by-Screen Behaviour

### Screen 1 — Splash Screen

**Purpose:** Brand moment + auth state check  
**Behaviour:**
- Display MCard logo + MIPS brand
- Check local auth token validity
- If valid: navigate to Home
- If invalid/absent: navigate to Onboarding
- Duration: max 1.5 seconds

---

### Screen 2 — Phone Number Entry

**Purpose:** Identity entry for OTP auth  
**Components:**
- Country flag + dial code (+230 hardcoded for MVP)
- Phone number field (7-8 digits, Mauritius format)
- "Send OTP" primary button
- Terms & Privacy links

**Validation:**
- Must be a valid Mauritius mobile number (57x, 58x, 59x, 52x, etc.)
- Disable button until valid format entered
- Rate limit: max 3 OTP requests per phone per 10 minutes

**On submit:**
- POST `/auth/otp/send` → returns `session_token` for OTP verification
- Show loading state
- Navigate to OTP screen

---

### Screen 3 — OTP Verification

**Purpose:** Verify phone ownership  
**Components:**
- 6 auto-advancing digit inputs
- Countdown timer (60 seconds)
- "Resend OTP" (active after countdown)
- Back button

**Behaviour:**
- Auto-submit on 6th digit entry
- Show inline error if wrong OTP ("Incorrect code, X attempts remaining")
- Lock after 5 failed attempts for 15 minutes
- Store JWT token on success (secure storage — Keychain/Keystore)

**On success:**
- New user → Profile Setup screen
- Returning user → Home screen

---

### Screen 4 — Profile Setup (New user only)

**Purpose:** Capture display name  
**Components:**
- Avatar picker (placeholder initials, camera, gallery)
- Display name field
- "Continue" button

**Behaviour:**
- Name: 2–50 characters, letters/spaces/hyphens only
- Avatar upload: compressed to 200×200 JPEG, stored in object storage
- Skip allowed: uses phone number as display name

---

### Screen 5 — Link Payment Methods

**Purpose:** Connect all payment rails  
**Components (per rail):**
- Card tile with "Add" or linked state
- Status badge (Verified / Pending / Error)
- "Skip — do later" footer link

**Card linking flow:**
1. Card number entry (masked on input after 4 digits)
2. Expiry + CVV
3. Name on card
4. MIPS tokenisation call → returns token
5. BIN lookup → show bank name + network logo

**Juice linking flow:**
1. Enter Juice number (5XXXXXXX format)
2. MCard sends OTP to that Juice number via MIPS/Juice API
3. User enters OTP to confirm ownership
4. Linked with rail reference stored

**POP / my.t money / blink:** Same pattern as Juice — OTP to the number.

---

### Screen 6 — Home Screen

**Purpose:** Dashboard and primary navigation  
**Layout:**

```
┌─────────────────────────────────────────┐
│  Good morning, Priya 👋     [Bell 🔔]  │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │  MY WALLET                        │  │
│  │  4 payment methods linked         │  │
│  │  Visa ••4321  |  Juice 5712XX    │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  [Incoming payment request — tap]       │
│  Pizza Palace • MRU 450.00 via Juice   │
├─────────────────────────────────────────┤
│  RECENT TRANSACTIONS                    │
│  ─────────────────────────────────────  │
│  Shoprite  •  MRU 1,250  •  Visa  •  ✓ │
│  Caltex    •  MRU 890    •  Juice •  ✓ │
│  KFC       •  MRU 320    •  POP   •  ✓ │
│  [See all →]                           │
└─────────────────────────────────────────┘
```

**Behaviour:**
- Wallet card: scrollable horizontally through linked methods
- Incoming Push2Phone: pulsing banner, auto-dismisses after 5 min if not actioned
- Recent transactions: last 3 only; tap opens detail

---

### Screen 7 — QR Scanner

**Purpose:** Scan merchant QR to initiate payment  
**Components:**
- Full-screen camera with animated scan frame
- Torch toggle
- Gallery import button
- Cancel (×)

**Behaviour:**
- Uses device camera via platform plugin (camera_description Flutter / CameraX Android)
- Decodes MIPS QR format, EMV QR, or static QR
- On decode: haptic feedback + navigate to Merchant Confirmation
- If unknown QR format: show inline error "This QR is not supported"

---

### Screen 8 — Merchant Confirmation

**Purpose:** Show who the consumer is about to pay  
**Components:**
- Merchant logo (from MIPS merchant registry)
- Merchant name + location
- Amount field (pre-filled if dynamic QR, editable if static)
- "Continue" / "Cancel"

**Behaviour:**
- QR decoded data sent to `POST /payments/qr/resolve`
- If merchant not found in MIPS registry: error screen
- Amount validation: min MRU 1, max MRU 100,000 (configurable per merchant)

---

### Screen 9 — Payment Method Selection

**Purpose:** Choose how to pay  
**Components:**
- Current preferred method highlighted (star icon)
- List of all linked methods with rail icon + last-4 or number
- "Set as default" toggle on long press
- "Add new method" link

**Behaviour:**
- Default pre-selected based on routing preferences
- Preference may be merchant-specific (from Push2Phone prefs table)
- Selecting a method: updates in-flight payment object only (not permanently)
- Permanent change requires "Set as default" action

---

### Screen 10 — Payment Confirmation

**Purpose:** Final payment review before authorisation  
**Components:**
- Merchant name + logo
- Amount (large, bold)
- Payment method with rail icon
- Estimated loyalty points to earn
- "Slide to Pay" gesture (prevents accidental taps)
- Small print: refund policy link

**Behaviour:**
- Slide-to-pay: horizontal gesture; snap-back if released before 80%
- On complete: POST `/payments/initiate`
- Loading overlay replaces button
- Timeout: 30 seconds; if exceeded → show timeout error

---

### Screen 11 — Transaction Result

**Purpose:** Confirm outcome  
**Success state:**
- Large green checkmark
- "Payment Successful"
- Amount + merchant name
- Loyalty points earned badge
- [View Receipt] [Go Home]

**Failure state:**
- Large red × 
- Error reason (human-readable)
- [Try different method] [Go Home]

---

### Screen 12 — Loyalty Wallet

**Purpose:** Aggregated loyalty view  
**Layout:**
```
┌─────────────────────────────────────────┐
│  MY LOYALTY                             │
│  Total equivalent: MRU 450 value        │
├─────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │Shoprite │  │ KFC     │  │Caltex   │ │
│  │ 1,200 pts│  │ 450 pts │  │ 890 pts │ │
│  └─────────┘  └─────────┘  └─────────┘ │
│  ┌─────────┐  ┌─────────┐              │
│  │Pizza Pal│  │Intermart│              │
│  │ 300 pts │  │ 120 pts │              │
│  └─────────┘  └─────────┘              │
└─────────────────────────────────────────┘
```

---

### Screen 13 — Merchant Loyalty Profile

**Purpose:** Points detail for one merchant  
**Components:**
- Merchant banner + logo
- Current points balance
- Tier progress bar (if merchant has tiers)
- Points history list (earned / redeemed)
- Active offers carousel
- [Redeem] button

**Redeem behaviour:**
- Generates a time-limited QR code valid at merchant POS
- QR encodes redemption token + consumer ID + merchant ID
- POS scans QR → calls MIPS loyalty API → deducts points

---

### Screen 14 — Transaction History

**Purpose:** Full payment history  
**Components:**
- Filter bar (All | Cards | Juice | POP | my.t | blink)
- Date range picker
- Transaction list rows:
  - Merchant icon + name
  - Amount + rail icon
  - Date/time
  - Status badge

**Behaviour:**
- Paginated (20 per page)
- Tap → Transaction Detail (receipt view with loyalty earned)
- Export as PDF (future)

---

### Screen 15 — Push2Phone Preferences

**Purpose:** Control where Push2Phone payments are routed  
**Components:**
- Global default selector (which rail + number)
- Per-merchant override list
- [+ Add merchant override] button

**Add override flow:**
1. Search merchant by name OR scan merchant QR
2. Select preferred rail + number
3. Save

**Behaviour:**
- Preferences stored in user profile on MIPS backend
- Synced on each app open
- Overrides evaluated at Push2Phone event time

---

## 8. Backend Architecture

### 8.1 System overview

```
┌──────────────────────────────────────────────────────────────┐
│                        CONSUMER LAYER                        │
│                   MCard Mobile App (Flutter)                 │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS / REST + WebSocket
┌────────────────────────────▼─────────────────────────────────┐
│                     MCARD API GATEWAY                        │
│              (Kong / AWS API Gateway / Nginx)                │
│         Auth  ·  Rate Limiting  ·  Routing  ·  Logging       │
└────┬────────────┬────────────┬────────────┬──────────────────┘
     │            │            │            │
┌────▼────┐  ┌───▼────┐  ┌───▼────┐  ┌────▼────┐
│  Auth   │  │ User   │  │Payment │  │ Loyalty │
│ Service │  │Profile │  │Orchestr│  │ Engine  │
│         │  │Service │  │Service │  │         │
└────┬────┘  └───┬────┘  └───┬────┘  └────┬────┘
     │            │            │            │
     └────────────┴────────────┴────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                    MIPS CORE PLATFORM                        │
│       Orchestration Engine  ·  Rail Adapters  ·  Routing     │
└────┬────────────┬────────────┬────────────┬──────────────────┘
     │            │            │            │
┌────▼────┐  ┌───▼────┐  ┌───▼────┐  ┌────▼────┐
│  Juice  │  │  POP   │  │my.t    │  │  blink  │
│  Rail   │  │  Rail  │  │money   │  │  Rail   │
└─────────┘  └────────┘  └────────┘  └─────────┘
```

### 8.2 Service responsibilities

| Service | Responsibility |
|---|---|
| Auth Service | OTP generation/validation, JWT issuance, session management |
| User Profile Service | Consumer profile CRUD, linked methods management, preferences |
| Payment Orchestration Service | QR resolution, payment initiation routing, Push2Phone dispatch |
| Loyalty Engine | Points accrual, balance queries, redemption, merchant programme management |
| Notification Service | Push notification delivery, in-app message queue |
| Merchant Registry | Merchant profile store, QR registry, logo/asset CDN |

### 8.3 Communication patterns

| Pattern | Use case |
|---|---|
| Synchronous REST | App ↔ API Gateway (all user-initiated actions) |
| Async message queue | Payment rail callbacks, loyalty accrual events |
| WebSocket | Push2Phone real-time notification delivery |
| Webhook | MIPS → MCard on payment state changes |

---

## 9. API Architecture

### 9.1 Base URL convention

```
https://api.mcard.mu/v1/{resource}
```

All responses use the envelope:
```json
{
  "status": "success" | "error",
  "data": { ... },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO8601"
  }
}
```

### 9.2 Authentication endpoints

```
POST /auth/otp/send
Request:
{
  "phone_number": "+23057123456"
}
Response:
{
  "status": "success",
  "data": {
    "session_token": "otp_session_abc123",
    "expires_in": 600,
    "resend_after": 60
  }
}

---

POST /auth/otp/verify
Request:
{
  "session_token": "otp_session_abc123",
  "otp_code": "847291"
}
Response:
{
  "status": "success",
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "rt_xyz789",
    "expires_in": 3600,
    "is_new_user": true
  }
}

---

POST /auth/token/refresh
Request:
{
  "refresh_token": "rt_xyz789"
}

---

DELETE /auth/session   (logout)
```

### 9.3 User profile endpoints

```
GET /users/me
Response:
{
  "data": {
    "user_id": "usr_abc123",
    "display_name": "Priya K.",
    "phone_number": "+23057123456",
    "avatar_url": "https://cdn.mcard.mu/avatars/abc123.jpg",
    "created_at": "2026-05-01T10:00:00Z",
    "kyc_level": "basic",
    "push2phone_preference": {
      "default_method_id": "pm_visa4321",
      "merchant_overrides": [
        {
          "merchant_id": "merch_pizzapalace",
          "method_id": "pm_juice5712"
        }
      ]
    }
  }
}

---

PATCH /users/me
Request:
{
  "display_name": "Priya K.",
  "avatar_url": "..."
}
```

### 9.4 Payment method endpoints

```
GET /payment-methods
Response: list of linked payment methods

---

POST /payment-methods/card
Request:
{
  "pan": "4111111111114321",   ← transmitted over TLS, never stored raw
  "expiry_month": "12",
  "expiry_year": "2028",
  "cvv": "123",               ← used for tokenisation only, never persisted
  "cardholder_name": "PRIYA KUMAR"
}
Response:
{
  "data": {
    "method_id": "pm_visa4321",
    "type": "card",
    "network": "visa",
    "last_four": "4321",
    "expiry": "12/28",
    "bank_name": "MCB Bank",
    "token": "tok_mips_abc123",
    "status": "active"
  }
}

---

POST /payment-methods/wallet
Request:
{
  "rail": "juice",  ← juice | pop | mytmoney | blink
  "phone_number": "+23057123456"
}
Response: initiates OTP to that number
{
  "data": {
    "verification_session": "ws_xyz",
    "expires_in": 300
  }
}

---

POST /payment-methods/wallet/verify
Request:
{
  "verification_session": "ws_xyz",
  "otp_code": "928471"
}

---

DELETE /payment-methods/{method_id}

---

PATCH /payment-methods/{method_id}/set-default
```

### 9.5 QR payment endpoints

```
POST /payments/qr/resolve
Request:
{
  "qr_payload": "00020101021226..."  ← raw QR string
}
Response:
{
  "data": {
    "merchant_id": "merch_shoprite_grandbaie",
    "merchant_name": "Shoprite Grand Baie",
    "merchant_logo_url": "...",
    "merchant_category": "grocery",
    "qr_type": "dynamic",  ← dynamic | static
    "amount": 1250.00,     ← null if static
    "currency": "MRU",
    "payment_reference": "qr_ref_abc"
  }
}

---

POST /payments/initiate
Request:
{
  "payment_reference": "qr_ref_abc",
  "method_id": "pm_visa4321",
  "amount": 1250.00,      ← required if static QR
  "merchant_id": "merch_shoprite_grandbaie"
}
Response:
{
  "data": {
    "transaction_id": "txn_mips_00123",
    "status": "processing",
    "poll_url": "/payments/txn_mips_00123/status"
  }
}

---

GET /payments/{transaction_id}/status
Response:
{
  "data": {
    "transaction_id": "txn_mips_00123",
    "status": "completed",  ← processing | completed | failed | timeout
    "amount": 1250.00,
    "merchant_name": "Shoprite Grand Baie",
    "rail": "visa",
    "loyalty_points_earned": 125,
    "receipt_url": "https://receipts.mcard.mu/txn_mips_00123.pdf"
  }
}
```

### 9.6 Push2Phone endpoints

```
POST /push2phone/incoming  ← called by MIPS backend, not app
Request (from MIPS):
{
  "consumer_phone": "+23057123456",
  "merchant_id": "merch_pizzapalace",
  "amount": 450.00,
  "currency": "MRU",
  "push_reference": "p2p_ref_xyz"
}
This triggers:
1. Preference lookup for consumer + merchant
2. Push notification to consumer's device

---

POST /push2phone/approve
Request (from app, consumer action):
{
  "push_reference": "p2p_ref_xyz",
  "method_id": "pm_juice5712"  ← consumer can override here
}

---

POST /push2phone/decline
Request:
{
  "push_reference": "p2p_ref_xyz",
  "reason": "declined_by_user"
}
```

### 9.7 Loyalty endpoints

```
GET /loyalty/summary
Response:
{
  "data": {
    "total_points": 2960,
    "total_mru_value": 296.00,
    "merchants": [
      {
        "merchant_id": "merch_shoprite",
        "merchant_name": "Shoprite",
        "points": 1200,
        "tier": "silver"
      }
    ]
  }
}

---

GET /loyalty/merchants/{merchant_id}
Response: detailed merchant loyalty profile + history

---

POST /loyalty/redeem
Request:
{
  "merchant_id": "merch_shoprite",
  "points_to_redeem": 500
}
Response:
{
  "data": {
    "redemption_token": "rdt_abc123",
    "qr_payload": "...",  ← QR to show at POS
    "expires_at": "2026-05-19T12:30:00Z"
  }
}
```

### 9.8 Transaction history endpoints

```
GET /transactions?page=1&per_page=20&rail=juice&from=2026-01-01&to=2026-05-19
Response: paginated transaction list

GET /transactions/{transaction_id}
Response: full transaction detail + loyalty info
```

---

## 10. Database Schema

### 10.1 Core entities (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(20) UNIQUE NOT NULL,
    display_name    VARCHAR(100),
    avatar_url      TEXT,
    kyc_level       VARCHAR(20) DEFAULT 'basic',  -- basic | standard | enhanced
    status          VARCHAR(20) DEFAULT 'active', -- active | suspended | blocked
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- OTP Sessions
CREATE TABLE otp_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(20) NOT NULL,
    session_token   VARCHAR(100) UNIQUE NOT NULL,
    otp_hash        VARCHAR(255) NOT NULL,     -- bcrypt hash of OTP
    attempts        INTEGER DEFAULT 0,
    expires_at      TIMESTAMPTZ NOT NULL,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_otp_phone ON otp_sessions(phone_number);
CREATE INDEX idx_otp_token ON otp_sessions(session_token);

-- User Sessions (JWT refresh tokens)
CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   VARCHAR(255) UNIQUE NOT NULL,
    device_id       VARCHAR(100),
    device_model    VARCHAR(100),
    fcm_token       TEXT,              -- Firebase push token
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Methods
CREATE TABLE payment_methods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL,       -- card | juice | pop | mytmoney | blink
    -- Card-specific
    last_four       VARCHAR(4),
    network         VARCHAR(20),               -- visa | mastercard | maestro
    expiry_month    VARCHAR(2),
    expiry_year     VARCHAR(4),
    bank_name       VARCHAR(100),
    mips_token      TEXT,                      -- MIPS tokenisation reference
    -- Wallet-specific
    phone_number    VARCHAR(20),
    rail_reference  TEXT,                      -- Reference returned by the rail on linking
    -- Common
    display_name    VARCHAR(100),              -- User-set nickname (optional)
    is_default      BOOLEAN DEFAULT FALSE,
    status          VARCHAR(20) DEFAULT 'active', -- active | expired | revoked
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_default UNIQUE (user_id, is_default) DEFERRABLE
);
CREATE INDEX idx_pm_user ON payment_methods(user_id);

-- Push2Phone Preferences
CREATE TABLE push2phone_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    merchant_id     UUID REFERENCES merchants(id),  -- NULL = global default
    method_id       UUID REFERENCES payment_methods(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, merchant_id)  -- One preference per user per merchant (NULL = global)
);

-- Merchants
CREATE TABLE merchants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mips_merchant_id VARCHAR(50) UNIQUE NOT NULL,   -- MIPS internal merchant ID
    name            VARCHAR(200) NOT NULL,
    category_code   VARCHAR(10),                     -- MCC code
    logo_url        TEXT,
    address         TEXT,
    city            VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- QR Codes (static only; dynamic are ephemeral)
CREATE TABLE merchant_qr_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID REFERENCES merchants(id),
    qr_payload      TEXT NOT NULL,
    qr_type         VARCHAR(10) NOT NULL,           -- static | dynamic
    label           VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mips_txn_id     VARCHAR(100) UNIQUE,            -- MIPS core transaction reference
    user_id         UUID REFERENCES users(id),
    merchant_id     UUID REFERENCES merchants(id),
    method_id       UUID REFERENCES payment_methods(id),
    rail            VARCHAR(20) NOT NULL,           -- card | juice | pop | mytmoney | blink
    amount          NUMERIC(12,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'MRU',
    direction       VARCHAR(10) DEFAULT 'debit',   -- debit | credit (future)
    status          VARCHAR(20) NOT NULL,           -- processing | completed | failed | refunded
    failure_reason  VARCHAR(200),
    initiated_via   VARCHAR(20),                   -- qr | push2phone | manual
    push_reference  VARCHAR(100),                  -- for Push2Phone flows
    loyalty_earned  INTEGER DEFAULT 0,
    receipt_url     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    settled_at      TIMESTAMPTZ
);
CREATE INDEX idx_txn_user ON transactions(user_id);
CREATE INDEX idx_txn_merchant ON transactions(merchant_id);
CREATE INDEX idx_txn_created ON transactions(created_at DESC);

-- Loyalty Programmes (per merchant)
CREATE TABLE loyalty_programmes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID REFERENCES merchants(id) UNIQUE,
    name            VARCHAR(200),
    points_per_mru  NUMERIC(8,4) DEFAULT 0.1,   -- Points earned per MRU spent
    mru_per_point   NUMERIC(8,4) DEFAULT 0.1,   -- Redemption rate
    min_redemption  INTEGER DEFAULT 100,
    tier_config     JSONB,                        -- Tier thresholds and names
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Loyalty Balances
CREATE TABLE loyalty_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    merchant_id     UUID REFERENCES merchants(id),
    programme_id    UUID REFERENCES loyalty_programmes(id),
    points_balance  INTEGER DEFAULT 0,
    lifetime_earned INTEGER DEFAULT 0,
    tier            VARCHAR(50),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, merchant_id)
);

-- Loyalty Transactions
CREATE TABLE loyalty_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    merchant_id     UUID REFERENCES merchants(id),
    transaction_id  UUID REFERENCES transactions(id),
    type            VARCHAR(20) NOT NULL,         -- earn | redeem | expire | adjust
    points          INTEGER NOT NULL,             -- positive for earn, negative for redeem
    balance_after   INTEGER NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Push2Phone Events
CREATE TABLE push2phone_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    push_reference  VARCHAR(100) UNIQUE NOT NULL,
    user_id         UUID REFERENCES users(id),
    merchant_id     UUID REFERENCES merchants(id),
    amount          NUMERIC(12,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'MRU',
    resolved_method_id UUID REFERENCES payment_methods(id),
    status          VARCHAR(20) DEFAULT 'pending',   -- pending | approved | declined | expired
    approved_at     TIMESTAMPTZ,
    declined_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    transaction_id  UUID REFERENCES transactions(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Log
CREATE TABLE notification_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(200),
    body            TEXT,
    data            JSONB,
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 10.2 Key indexes summary

| Table | Index columns | Reason |
|---|---|---|
| transactions | user_id, created_at DESC | History queries |
| transactions | merchant_id | Merchant analytics |
| loyalty_balances | user_id, merchant_id | Balance lookup |
| push2phone_events | push_reference | Event resolution |
| otp_sessions | phone_number, expires_at | Rate limiting |
| payment_methods | user_id, is_default | Routing |

---

## 11. Payment Routing Logic

### 11.1 Routing decision tree

```
Payment initiated (QR or Push2Phone)
             │
             ▼
   Is method_id explicitly passed?
        ├── YES → use that method → validate it's active → route
        └── NO  → lookup routing preference
                        │
                        ▼
             Is there a merchant-specific override?
             (push2phone_preferences WHERE merchant_id = X)
                        ├── YES → use that method
                        └── NO  → use global default preference
                                        │
                                        ▼
                             Is global default set?
                                        ├── YES → use it
                                        └── NO  → use first active payment method
                                                  (ordered by created_at ASC)
```

### 11.2 Rail routing table

| Rail | Routing mechanism | Auth mechanism |
|---|---|---|
| Visa / Mastercard (card) | MIPS → Acquirer → Card scheme | 3DS2 (OTP or biometric) |
| Juice | MIPS → Juice API | Juice PIN (entered in Juice app) |
| POP | MIPS → POP rail | POP PIN / biometric |
| my.t money | MIPS → MyT gateway | MyT PIN |
| blink | MIPS → MCB blink API | blink PIN / biometric |

### 11.3 Rail fallback logic

```
Primary rail attempt → FAILED (timeout or rail error)
             │
             ▼
  Is fallback enabled for this consumer?
        ├── YES → offer alternative method to consumer
        │         (UI: "Juice failed. Pay with card instead?")
        └── NO  → show failure, let consumer retry manually

Note: automatic silent fallback is NOT implemented in MVP.
Consumer must explicitly choose fallback to avoid surprise charges.
```

### 11.4 Routing preference API resolution (pseudocode)

```python
def resolve_payment_method(user_id: str, merchant_id: str) -> PaymentMethod:
    # 1. Check for explicit merchant override
    override = db.query(
        push2phone_preferences,
        where={"user_id": user_id, "merchant_id": merchant_id}
    )
    if override:
        method = db.get(payment_methods, override.method_id)
        if method.status == "active":
            return method

    # 2. Check global default
    global_default = db.query(
        push2phone_preferences,
        where={"user_id": user_id, "merchant_id": None}
    )
    if global_default:
        method = db.get(payment_methods, global_default.method_id)
        if method.status == "active":
            return method

    # 3. Fall back to default payment method flag
    default_method = db.query(
        payment_methods,
        where={"user_id": user_id, "is_default": True, "status": "active"}
    )
    if default_method:
        return default_method

    # 4. Fall back to oldest active method
    return db.query(
        payment_methods,
        where={"user_id": user_id, "status": "active"},
        order_by="created_at ASC",
        limit=1
    )
```

---

## 12. QR Payment Logic

### 12.1 QR format support

| Format | Type | Description |
|---|---|---|
| MIPS Proprietary QR | Static or Dynamic | Used by MIPS-enrolled merchants |
| EMVCo QR (CPS) | Static or Dynamic | International standard; POP supports this |
| Simple URL QR | Static | Redirect to payment page (least preferred) |

### 12.2 QR resolution flow

```
Consumer scans QR → raw payload captured
          │
          ▼
QR Parser (client-side)
  ├── Detect format (EMV tag 00 check / MIPS prefix)
  ├── Extract merchant ID, amount, reference
  └── Pass to backend for resolution

POST /payments/qr/resolve
          │
          ▼
MIPS Backend
  ├── Validate QR signature (prevent spoofed QR)
  ├── Look up merchant in registry
  ├── Check merchant active status
  ├── Return merchant profile + payment context
  └── If dynamic QR: validate freshness (max 5 minutes old)
```

### 12.3 Anti-spoofing measures

- All MIPS-generated QRs are **signed** with HMAC-SHA256 using a merchant-specific secret
- QR signature verified server-side on each resolve
- Dynamic QRs carry a `nonce` and `timestamp` — replayed QRs are rejected
- Static QRs are registered in merchant registry — unregistered QRs are rejected with clear error

### 12.4 Amount handling

| QR type | Amount handling |
|---|---|
| Dynamic QR (merchant POS generates) | Amount pre-filled, consumer cannot modify |
| Static QR (fixed amount printed) | Amount pre-filled from QR data, consumer cannot modify |
| Static QR (no amount) | Consumer enters amount manually |

---

## 13. Push2Phone Flow

### 13.1 Architecture

```
[Merchant POS / Cashier]
          │ initiates Push2Phone via MIPS API
          ▼
[MIPS Orchestration Engine]
          │ POST /push2phone/incoming to MCard backend
          │ (internal call — mTLS authenticated)
          ▼
[MCard Push2Phone Service]
  Step 1: Lookup user by phone number
  Step 2: Resolve payment method preference (see §11)
  Step 3: Create push2phone_event record (status=pending, expires=5min)
  Step 4: Send push notification to consumer device (FCM/APNs)
          │
          ▼
[Consumer's Device — MCard App]
  Receives push notification
  User opens app → Push2Phone request screen
          │
          ├── User APPROVES
          │       │
          │       ▼
          │   POST /push2phone/approve
          │       │
          │       ▼
          │   MCard backend → MIPS: trigger payment on resolved rail
          │       │
          │       ▼
          │   MIPS processes via rail (Juice/POP/card/etc.)
          │       │
          │       ▼
          │   Result → consumer result screen + notification
          │   Merchant POS receives payment confirmation
          │
          └── User DECLINES
                  │
                  ▼
              POST /push2phone/decline
                  │
                  ▼
              Merchant POS receives decline notification
```

### 13.2 Push2Phone timeout handling

| Scenario | Behaviour |
|---|---|
| Consumer does not respond in 5 minutes | Event expires, merchant notified |
| Consumer's app is closed | Push notification delivered; user approves on re-open if within 5 min |
| Consumer's device offline | Push queued by FCM; if delivered within window, still valid |
| Consumer has no FCM token | Fallback to SMS notification + web approval URL |

### 13.3 Push2Phone security

- Each push event has a unique `push_reference` (UUID)
- Approval request must carry `push_reference` — cannot re-use
- Consumer must pass local biometric/PIN before approval is transmitted
- Server verifies event is not expired, not already actioned
- MIPS internal call authenticated with mTLS + API key (not public)

---

## 14. Loyalty Engine Logic

### 14.1 Points earning flow

```
Transaction completed (status=completed)
          │
          ▼
Loyalty Engine receives event (async, via message queue)
          │
          ▼
Lookup loyalty_programme for merchant
  ├── Programme exists and is active?
  │       ├── YES → calculate points
  │       │   points = floor(amount * programme.points_per_mru)
  │       └── NO  → no points, log and exit
          │
          ▼
Upsert loyalty_balances
  UPDATE loyalty_balances
  SET points_balance = points_balance + earned_points,
      lifetime_earned = lifetime_earned + earned_points
  WHERE user_id = X AND merchant_id = Y

If no row exists: INSERT new balance

          │
          ▼
Insert loyalty_transactions record (type=earn)
          │
          ▼
Check tier upgrade
  ├── Merchant has tier_config?
  │       └── YES → evaluate lifetime_earned against thresholds
  │               → if tier changed: update loyalty_balances.tier
  │               → send tier upgrade notification
          │
          ▼
Emit points_earned event → Notification Service
→ App receives in-app notification + home screen refresh
```

### 14.2 Points redemption flow

```
Consumer taps [Redeem] in app
          │
          ▼
POST /loyalty/redeem
  { merchant_id, points_to_redeem }
          │
          ▼
Validate:
  - points_to_redeem >= programme.min_redemption
  - user balance >= points_to_redeem
          │
          ▼
Lock balance row (SELECT FOR UPDATE)
          │
          ▼
Insert loyalty_transactions (type=redeem, points=-X)
Update loyalty_balances.points_balance -= X
          │
          ▼
Generate redemption_token (signed JWT, 5 min TTL)
Generate QR from redemption_token
          │
          ▼
Consumer shows QR at POS
POS scans QR → calls MIPS Loyalty API
MIPS validates token → confirms redemption
Merchant POS applies discount / marks redeemed
```

### 14.3 Points expiry (configurable per programme)

- Default: points expire 12 months after last activity
- Expiry run: nightly batch job evaluates `loyalty_balances` for inactivity
- Before expiry: send push notification 30 days prior

### 14.4 Tier configuration example (JSON)

```json
{
  "tiers": [
    { "name": "Bronze", "min_lifetime_points": 0,    "benefits": [] },
    { "name": "Silver", "min_lifetime_points": 1000,  "benefits": ["5% bonus points"] },
    { "name": "Gold",   "min_lifetime_points": 5000,  "benefits": ["10% bonus points", "priority service"] }
  ]
}
```

---

## 15. Merchant-Side Logic

### 15.1 Merchant enrolment

Merchants are onboarded through the **MIPS merchant portal** (separate from MCard). From MCard's perspective, a merchant is simply an entry in the merchant registry once approved.

MCard reads from the merchant registry but never writes to it — write authority belongs to MIPS.

### 15.2 Merchant QR management

| QR type | Who generates | How |
|---|---|---|
| Static QR (no amount) | MIPS merchant portal | One-time; printed and placed at counter |
| Static QR (fixed amount) | MIPS merchant portal | Per product or service |
| Dynamic QR (per transaction) | Merchant POS via MIPS API | Generated at checkout time |

**Dynamic QR API (called by merchant POS):**
```
POST https://api.mips.mu/v1/qr/generate
{
  "merchant_id": "merch_shoprite_grandbaie",
  "amount": 1250.00,
  "currency": "MRU",
  "reference": "POS-INVOICE-00123",
  "ttl": 300  ← seconds before QR expires
}
Response:
{
  "qr_payload": "00020101021226...",
  "qr_image_url": "https://qr.mips.mu/img/abc123.png",
  "expires_at": "2026-05-19T12:05:00Z"
}
```

### 15.3 Loyalty programme setup

Merchants configure loyalty via the MIPS merchant portal:
- Enable/disable loyalty
- Set points-per-MRU rate
- Set redemption rate (MRU per point)
- Set minimum redemption threshold
- Configure tiers (optional)
- Set expiry policy

### 15.4 Merchant reporting (out of MCard scope for MVP)

The MIPS merchant portal provides:
- Daily transaction summary by rail
- Loyalty liability report (outstanding points)
- Consumer visit frequency heatmap
- Rail split analysis

---

## 16. Security & PCI Considerations

### 16.1 PCI DSS scope

MCard as a consumer app must minimise PCI DSS scope:

| Component | PCI scope? | Mitigation |
|---|---|---|
| Mobile app (PAN entry) | YES | Use MIPS-hosted tokenisation; PAN transmitted only over TLS 1.3; never stored in app or backend |
| MCard API backend | Reduced scope | PAN transits through but is never stored; MIPS tokenisation service is PCI-compliant |
| Database | Out of scope | Only tokens, last-four digits, and expiry stored — no PANs |
| MIPS tokenisation service | In scope | MIPS is responsible for PCI compliance of its tokenisation infrastructure |

### 16.2 Transport security

- All API communication: TLS 1.3 minimum
- Certificate pinning in mobile app (SHA-256 pin of MIPS API certificate)
- Internal service-to-service: mTLS with service mesh (Istio or Linkerd)
- Webhook callbacks from MIPS to MCard backend: signed with HMAC-SHA256; MCard verifies signature on receipt

### 16.3 Storage security

| Data | Storage | Encryption |
|---|---|---|
| JWT access tokens | Device memory (not persisted) | In-memory only |
| Refresh tokens | iOS Keychain / Android Keystore | Platform hardware-backed |
| Payment method tokens (MIPS tokens) | Database | AES-256 at rest (database-level encryption) |
| User PII (name, phone) | Database | AES-256 at rest |
| Biometric data | Device only | Never transmitted or stored server-side |

### 16.4 Authentication security

- OTP: 6-digit numeric; bcrypt-hashed in DB; 5-minute validity
- OTP rate limit: 3 sends per phone per 10 minutes; 5 failures = 15-minute lockout
- JWT: RS256 signed; 1-hour access token; 30-day refresh token
- Refresh token rotation: each refresh issues a new refresh token, invalidates old one
- Device binding: refresh token bound to device fingerprint; anomalous device triggers re-auth

### 16.5 Biometric/PIN local authentication

- Before any payment confirmation: require local biometric or PIN
- Uses platform biometric API (Face ID, fingerprint); no biometric data leaves device
- PIN: 6-digit; hashed with Argon2id; stored in device secure enclave equivalent
- 3 failed PIN attempts → session locked; requires OTP re-auth

### 16.6 API security

| Measure | Implementation |
|---|---|
| Authentication | Bearer JWT on all private endpoints |
| Rate limiting | Per-user: 100 req/min on payment endpoints; 10/min on auth |
| Input validation | Strict schema validation (JSON Schema / Pydantic) on all inputs |
| SQL injection | Parameterised queries only; ORM-enforced |
| CSRF | Not applicable (mobile API — no cookie sessions) |
| XSS | Not applicable (no HTML rendering in API) |
| Audit logging | All payment and auth events logged immutably to append-only audit table |

---

## 17. Tokenisation Approach

### 17.1 Card tokenisation

```
Consumer enters PAN in MCard app
          │ (TLS 1.3 only — never touches MCard database as raw PAN)
          ▼
MCard API receives PAN
          │
          ▼
MCard API forwards to MIPS Tokenisation Service
  POST https://tokenise.mips.mu/v1/cards
  { "pan": "4111111111114321", "expiry": "12/28", "cvv": "123" }
          │
          ▼
MIPS Tokenisation Service (PCI-compliant HSM-backed)
  - Stores PAN in PCI vault
  - Returns network token (Visa Token Service / Mastercard MDES)
  - Returns MIPS internal token (for non-scheme rails)
          │
          ▼
MCard backend stores:
  - mips_token: "tok_mips_abc123"
  - last_four: "4321"
  - network, expiry, bank_name
  - NEVER stores PAN, CVV, or full track data
```

### 17.2 Wallet rail linking

Juice, POP, my.t money, and blink accounts are linked by **phone number + OTP verification**. No credentials (PINs, passwords) are ever stored by MCard.

When a payment is triggered on a wallet rail:
- MCard instructs MIPS with the rail reference and amount
- MIPS's rail adapter handles the actual wallet API call using pre-authorised rail integrations
- The consumer's wallet PIN/biometric is entered **within the wallet's own system** (not MCard)

For Juice/POP/my.t money/blink Push2Phone specifically:
- MIPS pushes the payment request to the rail, which notifies the consumer via the rail's own mechanism
- MCard's role is routing — not executing the final authorisation within the rail

---

## 18. OTP Authentication Logic

### 18.1 OTP generation

```python
def generate_otp(phone_number: str) -> tuple[str, str]:
    # 1. Rate limit check
    recent_attempts = db.count(
        otp_sessions,
        where={"phone_number": phone_number, "created_at": "> NOW() - INTERVAL '10 minutes'"}
    )
    if recent_attempts >= 3:
        raise RateLimitError("Too many OTP requests")

    # 2. Generate 6-digit OTP
    otp = secrets.randbelow(900000) + 100000  # 100000–999999
    otp_str = str(otp)

    # 3. Hash it (bcrypt, cost=10)
    otp_hash = bcrypt.hash(otp_str)

    # 4. Generate session token
    session_token = secrets.token_urlsafe(32)

    # 5. Store session
    db.insert(otp_sessions, {
        "phone_number": phone_number,
        "session_token": session_token,
        "otp_hash": otp_hash,
        "expires_at": NOW() + timedelta(minutes=10),
        "attempts": 0
    })

    # 6. Send SMS via MIPS SMS gateway (or Vonage/Twilio)
    sms_gateway.send(
        to=phone_number,
        body=f"Your MCard verification code is {otp_str}. Valid for 10 minutes. Do not share."
    )

    return session_token
```

### 18.2 OTP verification

```python
def verify_otp(session_token: str, otp_code: str) -> User:
    session = db.get(otp_sessions, {"session_token": session_token})

    if not session:
        raise InvalidSessionError()
    if session.expires_at < NOW():
        raise ExpiredSessionError()
    if session.verified_at is not None:
        raise AlreadyUsedError()
    if session.attempts >= 5:
        raise LockedError("Too many failed attempts")

    session.attempts += 1
    db.save(session)

    if not bcrypt.verify(otp_code, session.otp_hash):
        raise InvalidOTPError(f"Attempts remaining: {5 - session.attempts}")

    # Mark verified
    session.verified_at = NOW()
    db.save(session)

    # Get or create user
    user = db.get_or_create(users, {"phone_number": session.phone_number})

    # Issue JWT
    access_token = jwt.encode({
        "sub": user.id,
        "phone": user.phone_number,
        "iat": NOW(),
        "exp": NOW() + timedelta(hours=1)
    }, private_key, algorithm="RS256")

    refresh_token = create_refresh_token(user.id, device_info)

    return {"access_token": access_token, "refresh_token": refresh_token, "user": user}
```

### 18.3 SMS delivery provider

For Mauritius MVP:
- **Primary:** Emtel or Orange Mauritius SMS API (local — best delivery rates)
- **Fallback:** Twilio or Vonage (international; activates if local fails within 10 seconds)
- **Monitoring:** Track delivery receipts; alert if delivery rate drops below 95%

---

## 19. Scalability Considerations

### 19.1 Expected MVP load

| Metric | MVP target | Scale target (Year 2) |
|---|---|---|
| Registered users | 50,000 | 300,000 |
| Daily active users | 5,000 | 50,000 |
| Transactions/day | 10,000 | 150,000 |
| Peak TPS | 20 | 200 |
| Push2Phone events/day | 2,000 | 30,000 |

### 19.2 Horizontal scaling plan

| Component | MVP | Scale |
|---|---|---|
| API servers | 2 instances (active-active) | Auto-scale group (min 2, max 20) |
| Database | Single primary + 1 read replica | Primary + 2 read replicas + PgBouncer |
| Cache (Redis) | Single instance | Redis Cluster (3 shards) |
| Message queue | Single RabbitMQ | RabbitMQ cluster or migrate to AWS SQS |
| Push notifications | Single FCM connection | FCM handles scale natively |

### 19.3 Caching strategy

| Data | Cache TTL | Key pattern |
|---|---|---|
| User profile | 5 minutes | `user:{user_id}:profile` |
| Payment methods list | 2 minutes | `user:{user_id}:methods` |
| Merchant registry entry | 1 hour | `merchant:{merchant_id}` |
| Loyalty balance | 30 seconds | `loyalty:{user_id}:{merchant_id}` |
| Push2Phone event | Until resolved | `p2p:{push_reference}` |

### 19.4 Database read scaling

- Transaction history queries use **read replicas** (tagged with `@replica` in ORM)
- Write queries (payments, loyalty updates) go to **primary**
- Loyalty balance updates use optimistic locking to prevent double-credit

---

## 20. Suggested Tech Stack

### 20.1 Mobile

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Flutter (Dart) | Single codebase for iOS + Android; strong Mauritius developer base |
| State management | Riverpod | Lightweight, testable, no boilerplate |
| HTTP client | Dio | Interceptors for auth, logging, retry |
| Local storage | Flutter Secure Storage | Keychain/Keystore backed |
| QR scanning | mobile_scanner | Actively maintained; supports iOS/Android |
| Biometrics | local_auth | Platform native (Face ID, fingerprint) |
| Push notifications | firebase_messaging | FCM + APNs via single SDK |
| Analytics | Firebase Analytics | Free tier sufficient for MVP |
| Crash reporting | Sentry | Real-time crash context |

### 20.2 Backend

| Layer | Choice | Rationale |
|---|---|---|
| Language | Python 3.12 | Fast development, strong fintech library ecosystem |
| Framework | FastAPI | Async, high performance, automatic OpenAPI docs |
| ORM | SQLAlchemy 2.0 (async) | Mature, flexible, compatible with PostgreSQL |
| Database | PostgreSQL 16 | ACID, JSON support, battle-tested |
| Cache | Redis 7 | Session store, rate limiting, caching |
| Message queue | RabbitMQ | Reliable, good Python client (aio-pika) |
| Auth | python-jose (JWT) + passlib (bcrypt/argon2) | Standard, auditable |
| API gateway | Kong Community | Open source; handles rate limiting, auth plugins |
| SMS | Emtel API / Vonage SDK | Local + international fallback |
| Push | Firebase Admin SDK | FCM + APNs via single integration |

### 20.3 Infrastructure

| Layer | Choice |
|---|---|
| Cloud | AWS (eu-west-1 — Ireland, closest to Mauritius with full services) |
| Container runtime | Docker + ECS Fargate (serverless containers — no EC2 management for MVP) |
| Container registry | AWS ECR |
| Database hosting | AWS RDS PostgreSQL (Multi-AZ for production) |
| Cache hosting | AWS ElastiCache Redis |
| Object storage | AWS S3 (avatars, receipts, QR images) |
| CDN | AWS CloudFront (for assets) |
| Secrets | AWS Secrets Manager |
| Monitoring | AWS CloudWatch + Datadog (APM) |
| CI/CD | GitHub Actions |

---

## 21. Flutter vs React Native

| Criterion | Flutter | React Native |
|---|---|---|
| **Performance** | Near-native (Skia renderer, no JS bridge) | Good, but JS bridge is a bottleneck for heavy animations |
| **UI consistency** | Pixel-perfect across iOS/Android (draws its own UI) | Uses native components; slight platform variation |
| **Developer ecosystem** | Growing fast; excellent for fintech apps | Larger ecosystem; more third-party libraries |
| **Mauritius dev talent** | Available; Dart is easy to learn | Larger JS/React talent pool locally |
| **Biometric / camera** | Good plugin support (local_auth, mobile_scanner) | Good but React Native plugin quality is variable |
| **Hot reload** | Excellent | Good |
| **Build size** | Slightly larger (~20MB base) | Similar |
| **WebView / web integration** | Possible but Flutter is app-first | Easier if web sharing needed |
| **Suitability for MCard** | ★★★★★ — ideal for consistent payment UI | ★★★★☆ — perfectly viable |
| **Recommendation** | **Prefer Flutter** | Acceptable alternative |

**Recommendation: Flutter.** The consistent UI rendering across platforms is critical for payment trust (consumers must feel the experience is polished and identical on every device). Flutter's Dart is straightforward to hire for in Mauritius, and the plugin ecosystem for payment-adjacent features (biometric, QR, secure storage) is mature.

---

## 22. Backend Stack

### 22.1 Full backend architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENTS                              │
│         Flutter App (iOS + Android)  ·  Merchant Portal     │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│                      AWS API GATEWAY                         │
│                  (or Kong on ECS/EC2)                        │
│   Rate Limiting · Auth Header Validation · WAF · Logging     │
└────┬───────────┬───────────┬───────────┬─────────────────────┘
     │           │           │           │
┌────▼──┐   ┌───▼───┐   ┌───▼───┐   ┌───▼────┐
│ Auth  │   │ User  │   │Payment│   │Loyalty │
│Service│   │Service│   │Service│   │Engine  │
│FastAPI│   │FastAPI│   │FastAPI│   │FastAPI │
│:8001  │   │:8002  │   │:8003  │   │:8004   │
└────┬──┘   └───┬───┘   └───┬───┘   └───┬────┘
     │           │           │           │
     └───────────┴─────┬─────┴───────────┘
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
    ┌─────▼────┐  ┌─────▼────┐  ┌────────▼──────┐
    │PostgreSQL│  │  Redis   │  │  RabbitMQ     │
    │  (RDS)   │  │(ElastiC.)│  │  (async events│
    └──────────┘  └──────────┘  └───────────────┘
```

### 22.2 Service breakdown (FastAPI microservices)

Each service is a separate FastAPI application, containerised independently, deployed on ECS Fargate.

| Service | Port | Key dependencies |
|---|---|---|
| auth-service | 8001 | PostgreSQL (otp_sessions, user_sessions), Redis (rate limits), SMS gateway |
| user-service | 8002 | PostgreSQL (users, payment_methods, preferences), Redis |
| payment-service | 8003 | PostgreSQL (transactions, push2phone_events), MIPS core API, RabbitMQ (events) |
| loyalty-engine | 8004 | PostgreSQL (loyalty_*), RabbitMQ (consumes payment events), Redis |
| notification-service | 8005 | Firebase Admin SDK, RabbitMQ (consumes all events), notification_log |
| merchant-registry | 8006 | PostgreSQL (merchants, qr_codes), Redis (merchant cache) |

### 22.3 Internal communication

| Pattern | Used for |
|---|---|
| REST over internal network | Synchronous lookups between services (e.g., payment-service → user-service for preference) |
| RabbitMQ publish/subscribe | Payment completed → loyalty engine; payment completed → notification |
| Redis pub/sub | Real-time WebSocket push (payment status updates to app) |

---

## 23. Cloud Architecture

```
AWS eu-west-1 (Ireland)
│
├── VPC
│   ├── Public subnets (2 AZs)
│   │   ├── Application Load Balancer
│   │   └── NAT Gateway
│   │
│   └── Private subnets (2 AZs)
│       ├── ECS Fargate Cluster
│       │   ├── auth-service (2 tasks, min)
│       │   ├── user-service (2 tasks, min)
│       │   ├── payment-service (2 tasks, min)
│       │   ├── loyalty-engine (1 task, min)
│       │   ├── notification-service (1 task, min)
│       │   └── merchant-registry (1 task, min)
│       │
│       ├── RDS PostgreSQL (Multi-AZ)
│       │   ├── Primary (write)
│       │   └── Read Replica
│       │
│       ├── ElastiCache Redis (cluster mode disabled, MVP)
│       │
│       └── RabbitMQ (Amazon MQ managed)
│
├── S3 Buckets
│   ├── mcard-avatars (private + signed URLs)
│   ├── mcard-receipts (private + signed URLs)
│   └── mcard-qr-images (public read via CloudFront)
│
├── CloudFront Distribution
│   └── Origin: S3 + ALB (static assets + API)
│
├── AWS WAF
│   └── Rules: OWASP top 10, rate limiting, geo-block
│
├── Route 53
│   └── api.mcard.mu → ALB
│
├── AWS Certificate Manager
│   └── TLS cert for *.mcard.mu
│
├── AWS Secrets Manager
│   └── DB credentials, API keys, JWT private keys
│
├── CloudWatch
│   ├── Logs (all service stdout)
│   ├── Metrics dashboards
│   └── Alarms (error rate, latency, queue depth)
│
└── AWS SES (email for receipts — future)
```

**Estimated monthly AWS cost (MVP):**

| Service | Estimated MRU/month |
|---|---|
| ECS Fargate (6 services, 2 tasks each) | ~MRU 8,000 |
| RDS PostgreSQL Multi-AZ (db.t3.medium) | ~MRU 5,000 |
| ElastiCache Redis (cache.t3.micro) | ~MRU 1,500 |
| Amazon MQ (mq.m5.large) | ~MRU 3,000 |
| ALB + data transfer | ~MRU 1,500 |
| S3 + CloudFront | ~MRU 500 |
| CloudWatch, WAF, misc | ~MRU 2,000 |
| **Total (approx.)** | **~MRU 21,500/month** |

---

## 24. DevOps Architecture

### 24.1 CI/CD pipeline (GitHub Actions)

```
Developer pushes to feature branch
          │
          ▼
GitHub Actions: CI Pipeline
  ├── Lint (flake8, black, isort)
  ├── Type check (mypy)
  ├── Unit tests (pytest, 80% coverage required)
  ├── Security scan (bandit, safety)
  └── Docker build (verify image builds)
          │
          ▼ (PR merged to main)
GitHub Actions: CD Pipeline
  ├── Build Docker image
  ├── Push to ECR
  ├── Run integration tests against staging
  ├── Deploy to staging (ECS task update)
  ├── Smoke test (5 key API endpoints)
  └── Manual approval gate → Deploy to production
          │
          ▼
ECS Rolling Update
  ├── New task version starts alongside old
  ├── Health check must pass (3 consecutive)
  ├── Old task drained and stopped
  └── Zero-downtime deployment
```

### 24.2 Environment strategy

| Environment | Purpose | Data |
|---|---|---|
| dev | Local developer machines (docker-compose) | Seeded synthetic data |
| staging | Pre-production integration testing | Anonymised production-like data |
| production | Live | Real consumer data |

### 24.3 Monitoring & alerting

| Alert | Threshold | Channel |
|---|---|---|
| API error rate > 1% | 5-minute window | PagerDuty → on-call engineer |
| P99 latency > 2s on /payments/initiate | 2-minute window | Slack #alerts |
| OTP delivery rate < 95% | 10-minute window | Slack #alerts |
| Payment failure rate > 5% | 5-minute window | PagerDuty urgent |
| Database replication lag > 30s | Continuous | PagerDuty urgent |
| Queue depth > 10,000 messages | Continuous | Slack #alerts |

### 24.4 Deployment checklist (per release)

- [ ] All tests green on staging
- [ ] Database migrations applied to staging and verified
- [ ] Feature flags configured
- [ ] Rollback plan documented (previous ECS task definition pinned)
- [ ] On-call engineer notified
- [ ] Deploy during low-traffic window (02:00–04:00 MUT)

---

## 25. Fraud & Abuse Considerations

### 25.1 Identity fraud

| Threat | Mitigation |
|---|---|
| Account takeover via OTP theft | OTP rate limiting; SIM swap detection (check carrier); brute-force lockout |
| SIM swap attack | After SIM swap, require secondary verification (email OTP if set, or wait 24h) |
| Multiple accounts on same device | Device fingerprint check; flag for review if >2 accounts on same device |
| Stolen device | Remote session revocation via Settings; refresh token invalidation |

### 25.2 Payment fraud

| Threat | Mitigation |
|---|---|
| QR tampering | HMAC-signed QRs; signature verified server-side |
| Replay attacks on QR | Nonce + timestamp in dynamic QRs; one-use enforcement |
| Push2Phone spoofing | mTLS on MIPS → MCard internal call; signed push references |
| Velocity abuse | Max 10 transactions per consumer per hour; max MRU 10,000 per day (configurable) |
| Unusual geolocation | Device GPS vs. merchant location check (advisory, not blocking, in MVP) |

### 25.3 Loyalty fraud

| Threat | Mitigation |
|---|---|
| Redemption token reuse | One-use enforcement; server marks token as used on first scan |
| Points inflation via refunds | Loyalty deducted on refund (reverse accrual) |
| Fake merchant QR for earning | Merchant QR signature check before loyalty accrual |

### 25.4 Fraud monitoring (MVP)

- **Real-time:** velocity rules in API middleware (Redis counters)
- **Async:** daily batch analysis on transaction patterns
- **Flagging:** suspicious accounts flagged for manual review (not auto-blocked in MVP)
- **Future:** ML-based anomaly detection (post-MVP)

---

## 26. KYC Considerations

### 26.1 KYC tiering for MVP

MCard is not a wallet issuer and does not hold consumer funds. This significantly reduces KYC obligations under the Bank of Mauritius AML/CFT framework.

| Level | Requirements | MCard functionality unlocked |
|---|---|---|
| **Basic** (phone verified) | Phone number OTP only | View history; Pay via linked external rails (Juice, POP, etc.); Loyalty accrual |
| **Standard** (ID verified) | NID / passport scan + selfie match | Higher transaction limits; card linking |
| **Enhanced** (full KYC) | Proof of address + source of funds | Future: MCard stored value or credit products |

### 26.2 MVP KYC position

- MVP ships with **Basic level only** for all consumers
- Card linking requires Standard KYC (manual verification by MIPS compliance team at MVP; automated in future)
- Transaction limits at Basic level: MRU 5,000/day, MRU 50,000/month
- KYC data collected via in-app flow (photo upload) but **reviewed manually** by MIPS compliance in MVP

### 26.3 Regulatory obligations

| Obligation | Owner | Status |
|---|---|---|
| AML/CFT policy | MIPS | Must be documented before launch |
| PEP/sanctions screening | MIPS | Integrate with screening provider (e.g., ComplyAdvantage) |
| STR reporting | MIPS | Process established |
| Data retention (7 years) | MCard + MIPS | Database backup policy must cover 7 years |
| Consumer data protection (Data Protection Act 2017, Mauritius) | MIPS | Privacy policy + DPA registration |

---

## 27. Future Roadmap

### Phase 1 — MVP (0–6 months)
Core payment rails, QR, Push2Phone, basic loyalty, phone auth.

### Phase 2 — Loyalty expansion (6–12 months)
- Merchant-configurable loyalty rules (bonus events, campaigns)
- Loyalty points transfer between merchants (if merchant network agrees)
- In-app offers and targeted promotions
- Push notification marketing campaigns (opt-in)

### Phase 3 — Advanced payment features (12–18 months)
- Request Money (peer-to-peer via MCard between consumers)
- Split bill (MCard-to-MCard)
- Recurring payment schedules
- Spending analytics and insights

### Phase 4 — Merchant app (18–24 months)
- Lightweight merchant companion app (tap-to-pay via NFC, generate dynamic QR)
- Real-time merchant dashboard (sales, loyalty liability)
- Push notification to consumers ("Offer: 2x points this weekend at Shoprite")

### Phase 5 — Financial services layer (24+ months)
- MCard credit product (Buy Now Pay Later integrated with MIPS)
- Savings round-up (round up every transaction, save the difference)
- Insurance micro-products at checkout
- Cross-border payments (regional expansion)

---

## 28. Monetization Opportunities

| Revenue stream | Model | Target | MVP? |
|---|---|---|---|
| Loyalty platform fee | Per point issued to consumer (e.g., 0.5 MRU per 10 points) | Merchants | No (Phase 2) |
| QR payment processing fee | % of transaction value (typically 0.5–1.5%) via MIPS existing MDR | Merchants | Yes (via MIPS MDR split) |
| Premium merchant listing | Featured placement in loyalty tab | Merchants | No |
| Data insights (anonymised) | Aggregated spend reports sold to brands | FMCG / brands | No (Phase 3) |
| Push notification campaigns | Charge merchant per targeted push sent | Merchants | No (Phase 2) |
| White-label SDK | Offer MCard loyalty infrastructure to non-MIPS merchants | Enterprise | No (Phase 4) |
| Consumer premium tier | MCard+ subscription: no transaction limits, priority support | Consumers | No |
| Float on loyalty points | Points issued but not yet redeemed — float management | Internal | Passive (from Phase 2) |

**MVP revenue model:** MCard does not generate direct consumer revenue at MVP. Revenue flows through MIPS's existing merchant discount rate (MDR) on payment volume routed through the platform. MCard increases MIPS's payment volume and consumer stickiness — monetisation depth follows in Phase 2.

---

## 29. Competitive Positioning in Mauritius

| App / Service | Type | Strengths | Weaknesses vs. MCard |
|---|---|---|---|
| Juice (Emtel) | Wallet + P2P | Large user base; Emtel SIM integration | Single rail; no card support; limited loyalty |
| my.t money | Wallet | MyT ecosystem; bill payments | Single rail; no QR interop; limited merchant reach |
| blink (MCB) | Wallet + card link | MCB customer loyalty; NFC capable | MCB-only; no POP/Juice support |
| POP (BoM national rail) | Payment rail | Interoperability mandate; government backed | No consumer app; no loyalty; raw infrastructure |
| JuicePay / Orange Money | Wallet | Operator integration | Fragmented; no unified view |
| MCB Juice tap | NFC card | Physical convenience | Single bank; no loyalty aggregation |
| **MCard** | **Orchestration companion** | **Rail-agnostic; loyalty aggregation; Push2Phone control; MIPS-powered** | **New entrant; requires merchant network** |

### 29.1 Market gap MCard fills

```
Feature                 │ Juice │ blink │ my.t │ POP  │ MCard
──────────────────────────────────────────────────────────────
Pay with any rail       │  ✗   │  ✗   │  ✗  │  ✗  │  ✓
Unified loyalty view    │  ✗   │  ✗   │  ✗  │  ✗  │  ✓
Push2Phone routing ctrl │  ✗   │  ✗   │  ✗  │  ✗  │  ✓
Card + wallet in 1 app  │  ✗   │  Partial│ ✗  │  ✗  │  ✓
QR interoperability     │  Partial│ ✗   │  ✗  │  ✓  │  ✓
Single transaction hist │  ✗   │  ✗   │  ✗  │  ✗  │  ✓
```

---

## 30. Competitive Differentiation

### 30.1 The MIPS moat

MCard's primary differentiator is that it is built **on top of MIPS**, which already has:
- Merchant terminal relationships
- Acquirer bank relationships
- Rail API integrations
- PCI-compliant infrastructure
- Regulatory standing

No other consumer app in Mauritius has this orchestration substrate. Building MCard without MIPS would require years of bank and rail partnerships — MCard inherits all of this from day one.

### 30.2 Network effect flywheel

```
More merchants on MIPS
         │
         ▼
More payment options for MCard users
         │
         ▼
More consumer downloads
         │
         ▼
More transaction volume routed through MIPS
         │
         ▼
More merchant demand to be on MIPS
         │
         └── (back to top — self-reinforcing)
```

### 30.3 Key differentiators vs. each competitor

| Competitor | MCard's edge |
|---|---|
| Juice | MCard works with Juice AND all other rails simultaneously |
| blink | MCard is not locked to MCB customers; works for any bank cardholder |
| my.t money | MCard aggregates loyalty; my.t money has no loyalty product |
| POP | MCard puts a consumer UX on top of what POP only provides as infrastructure |

---

## 31. Risks & Constraints

### 31.1 Technical risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rail API integration delays (Juice, my.t, blink) | High | High | Begin rail integration discovery in sprint 1; negotiate SLAs |
| Push notification unreliability (FCM on Android) | Medium | Medium | Implement SMS fallback for critical Push2Phone events |
| QR format heterogeneity | Medium | Medium | Ship with MIPS + EMV QR; log unsupported QRs for future support |
| Device fragmentation (budget Android in Mauritius) | Medium | Low | Target Android API 26+ (covers ~90% of Mauritian Android devices) |
| Biometric unavailability on older devices | Medium | Low | Fall back to 6-digit PIN if no biometric hardware |

### 31.2 Business risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Merchant adoption slower than projected | Medium | High | Launch with 10 anchor merchants pre-signed before app goes live |
| Rail operators reluctant to support MCard (competitor perception) | Medium | High | Position MCard as volume-driver for rails, not a competitor |
| Bank of Mauritius regulatory question on aggregation | Low | High | Engage BoM early; position as routing companion, not a payment institution |
| Consumer trust in sharing payment info | Medium | Medium | Transparent onboarding; clear data policy; MIPS brand credibility |
| Low SMS OTP delivery in rural areas | Low | Low | Emtel/Orange local gateways have ~99% Mauritius coverage |

### 31.3 Operational constraints

- MIPS currently has no consumer-facing brand recognition — marketing investment required
- App store approval timelines (Apple App Store: 1–7 days; Google Play: 1–3 days)
- PCI certification for tokenisation must be completed before card linking launch
- SSL certificate pinning must be updated carefully — bad pin = app broken for all users

---

## 32. Go-to-Market Recommendations

### 32.1 Launch strategy

**Closed beta (Month 4–5 of development):**
- 500 selected consumers (MIPS staff + families + merchant test accounts)
- 10 pilot merchants (mix of grocery, food, fuel)
- Goal: validate payment flows end-to-end; surface UX issues

**Soft launch (Month 6):**
- App live on Play Store + App Store (unlisted / invite-only)
- 5,000 invite-based users
- 25 merchants live
- PR to fintech media + BoM awareness

**Public launch (Month 7–8):**
- Open to all; marketing campaign begins
- Target: 20,000 downloads in first month

### 32.2 Merchant acquisition

- Pre-onboard 10 anchor merchants before consumer launch (Shoprite, Super U, Caltex, KFC/fast food chains, at least 2 local restaurants)
- Offer 3-month free loyalty programme to first 100 merchants
- Position as "zero extra terminal — you're already on MIPS"

### 32.3 Consumer acquisition

| Channel | Tactic |
|---|---|
| MIPS merchant network | QR table tents: "Pay with MCard, earn rewards" |
| Social media | Facebook (dominant in Mauritius) + Instagram |
| Influencer marketing | Mauritian micro-influencers (5k–50k followers) |
| SMS to existing MIPS cardholders | With cardholder bank consent |
| Bank partnerships | MCB, SBM, MPCB newsletter / app banner |
| Radio | Radio 1, Radio Plus (widely listened in Mauritius) |

### 32.4 Pricing for consumers

**Free forever for consumers.** No subscription fee, no per-transaction charge to consumer. Value proposition must be additive (earn loyalty, see history) — any fee creates friction.

---

## 33. Suggested MVP Timeline

### 33.1 12-week sprint plan

| Sprint | Weeks | Deliverables |
|---|---|---|
| Sprint 0 | 1–2 | Architecture finalization, environment setup, repo structure, design system |
| Sprint 1 | 3–4 | Auth service (OTP), user profile service, Flutter app shell + navigation |
| Sprint 2 | 5–6 | Payment method linking (card + Juice), Push2Phone preferences UI, basic home screen |
| Sprint 3 | 7–8 | QR scanner, QR resolution, payment initiation (card rail first), result screens |
| Sprint 4 | 9–10 | Push2Phone flow (receive, approve, decline), loyalty engine (earn), loyalty UI |
| Sprint 5 | 11–12 | Transaction history, loyalty redemption, notifications, settings, security hardening |
| Beta | 13–16 | Closed beta, bug fixes, performance tuning, merchant onboarding, App Store submission |
| Launch | 17–20 | Soft launch, monitoring, rapid iteration |

### 33.2 Pre-launch gates

- [ ] End-to-end payment test on all 4 rails (card, Juice, POP, my.t money)
- [ ] Push2Phone tested with live merchant POS
- [ ] Penetration test (external, focused on auth + payment endpoints)
- [ ] PCI tokenisation certification in place
- [ ] Privacy policy published and BoM notification sent
- [ ] App Store + Play Store submissions approved
- [ ] 10 anchor merchants signed and onboarded
- [ ] SMS OTP delivery test (Emtel + Orange + MTML numbers)
- [ ] Load test: simulate 100 concurrent payment initiations
- [ ] Rollback procedure tested

---

## 34. Suggested Team Structure

### 34.1 Core MVP team

| Role | FTEs | Responsibilities |
|---|---|---|
| **Product Manager** | 1 | Roadmap, backlog, merchant relationships, go-to-market |
| **Tech Lead / Backend Architect** | 1 | Architecture decisions, code review, MIPS integration |
| **Senior Backend Developer** | 2 | FastAPI services, database, MIPS API integration |
| **Senior Flutter Developer** | 2 | Mobile app (iOS + Android), UX implementation |
| **UI/UX Designer** | 1 | Figma designs, design system, UX flows |
| **DevOps Engineer** | 1 (part-time) | AWS infrastructure, CI/CD, monitoring |
| **QA Engineer** | 1 | Test cases, regression, performance testing |
| **Security Consultant** | 1 (contract) | Pen test, PCI review, security architecture sign-off |
| **MIPS Integration Liaison** | 1 | Coordinate with MIPS platform team for rail APIs |

**Total: ~9 people (7 FTE + 1 part-time + 1 contractor)**

### 34.2 Extended team (post-launch)

| Role | FTEs | When |
|---|---|---|
| Customer Support Lead | 1 | Launch day |
| Data Analyst | 1 | Month 2 post-launch |
| Merchant Success Manager | 1 | Month 2 post-launch |
| Junior Flutter Developer | 1 | Phase 2 |
| Machine Learning Engineer | 1 | Phase 3 (fraud / personalisation) |

### 34.3 RACI for key decisions

| Decision | Product Manager | Tech Lead | CTO (MIPS) |
|---|---|---|---|
| Feature scope | A/R | C | I |
| Architecture choices | I | A/R | C |
| Rail API integration | C | A/R | R |
| App Store strategy | A/R | C | I |
| Security sign-off | C | R | A |

---

## 35. Suggested KPIs

### 35.1 Product KPIs

| KPI | Definition | MVP target (Month 6) | Year 1 target |
|---|---|---|---|
| Registered users | Unique users who completed OTP | 20,000 | 150,000 |
| Monthly active users | Users with ≥1 session in 30 days | 8,000 | 80,000 |
| D30 retention | Users still active 30 days after registration | >30% | >45% |
| Payment methods linked per user | Average linked methods at registration | >1.2 | >2.0 |
| QR payments / month | Successful QR-initiated payments | 15,000 | 200,000 |
| Push2Phone approvals / month | Successful P2P approvals | 5,000 | 75,000 |
| Loyalty merchants enrolled | Live merchants with loyalty programme | 25 | 150 |
| Loyalty engagement rate | Users who checked loyalty tab in 30 days | >40% | >60% |
| Payment success rate | Completed / initiated payments | >97% | >98.5% |

### 35.2 Technical KPIs

| KPI | Target |
|---|---|
| API P95 latency (/payments/initiate) | < 1.5 seconds |
| API P99 latency (/payments/initiate) | < 3 seconds |
| App crash-free sessions rate | > 99.5% |
| OTP delivery success rate | > 98% |
| Push notification delivery rate (FCM) | > 97% |
| Uptime (auth + payment services) | > 99.9% |
| Deployment frequency | ≥ 2 per week (post-MVP stabilisation) |
| Mean time to recovery (MTTR) | < 30 minutes |

### 35.3 Business KPIs

| KPI | Definition | Target |
|---|---|---|
| Payment volume (GTV) | Total MRU transacted via MCard | MRU 5M/month by Month 6 |
| Active merchants | Merchants with ≥1 MCard transaction in 30 days | 50 by Month 6 |
| MIPS rail volume uplift | % increase in MIPS payment volume attributable to MCard | +5% by Year 1 |
| Consumer acquisition cost (CAC) | Marketing spend / new user | < MRU 150 |
| Push2Phone routing accuracy | Payments routed to consumer's preferred rail | > 95% |
| NPS | Net Promoter Score from in-app survey | > 45 |

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| MIPS | Mauritius Interbank Payment System / MIPS payment orchestration platform |
| Push2Phone | Payment initiation from merchant POS directly to consumer's mobile number |
| QR Rail | The payment rail used when a consumer scans a merchant QR code |
| Rail | A payment channel (card, Juice, POP, my.t money, blink) |
| MDR | Merchant Discount Rate — the fee charged to merchants per transaction |
| PAN | Primary Account Number — the card number |
| Token / MIPS Token | A surrogate value that represents a PAN without exposing it |
| EMVCo QR | The international QR payment standard from the EMV standards body |
| FCM | Firebase Cloud Messaging — Google's push notification service for Android + iOS |
| APNs | Apple Push Notification service |
| MRU | Mauritian Rupee |
| BoM | Bank of Mauritius |
| NID | National Identity Document (Mauritius national ID card) |
| PCI DSS | Payment Card Industry Data Security Standard |
| HSM | Hardware Security Module — tamper-resistant device used in card tokenisation |
| JWT | JSON Web Token — the access token format used for API authentication |
| ORM | Object-Relational Mapper — maps database tables to code objects |
| GTV | Gross Transaction Value — total payment volume |
| KYC | Know Your Customer — identity verification process |
| AML/CFT | Anti-Money Laundering / Countering Financing of Terrorism |

---

## Appendix B — MIPS Integration Points Summary

| Integration | Direction | Protocol | Auth |
|---|---|---|---|
| Tokenisation service | MCard → MIPS | HTTPS REST | API Key + mTLS |
| QR generation (merchant POS) | POS → MIPS | HTTPS REST | API Key |
| QR resolution | MCard → MIPS | HTTPS REST | JWT |
| Payment initiation (card) | MCard → MIPS → Acquirer | HTTPS REST | JWT + mTLS |
| Payment initiation (wallet rails) | MCard → MIPS → Rail | HTTPS REST | JWT + mTLS |
| Push2Phone incoming | MIPS → MCard backend | HTTPS REST | mTLS + API Key |
| Push2Phone approve → rail | MCard → MIPS → Rail | HTTPS REST | JWT + mTLS |
| Loyalty events | MIPS → MCard (webhook) | HTTPS POST | HMAC-SHA256 sig |
| Merchant registry sync | MIPS → MCard (periodic) | HTTPS REST | API Key |

---

*Document end — MCard MVP Specification v1.0*  
*Prepared by MIPS Product & Architecture Team*  
*Next review: post-Sprint 0 architecture workshop*
