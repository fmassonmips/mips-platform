# InsurLink MU — User Manual
**English Edition | Version 1.0**
*For Insurance Brokers and Agents*

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Dashboard](#3-dashboard)
4. [Managing Clients](#4-managing-clients)
5. [Managing Policies](#5-managing-policies)
6. [Booking Appointments](#6-booking-appointments)
7. [Payment Links](#7-payment-links)
8. [Renewal Pipeline](#8-renewal-pipeline)
9. [Settings](#9-settings)
10. [Frequently Asked Questions](#10-frequently-asked-questions)
11. [Glossary](#11-glossary)

---

## 1. Introduction

### What is InsurLink MU?

InsurLink MU is an all-in-one platform built specifically for insurance brokers in Mauritius. It helps you:

- **Never miss a renewal** — automated reminders are sent to your clients at 45, 30, and 15 days before expiry.
- **Get paid faster** — generate a MIPS or Juice payment link in seconds and send it directly to your client via email or WhatsApp.
- **Book inspections without the back-and-forth** — share a booking link with clients so they can choose their own appointment slot.
- **Keep a clean record** — all policies, communications, and payments are logged in one place, FSC-audit ready.

### Who is this manual for?

This manual is for:
- **Brokers / Agents** — the day-to-day users managing clients and policies.
- **Brokerage Managers / Admins** — team leaders with access to all agents' portfolios and platform settings.

---

## 2. Getting Started

### 2.1 Logging In

1. Open your browser and go to `https://app.insurlink.mu`.
2. Enter your **email address** and **password**.
3. Click **Log In**.

> **Tip:** For security, the platform will automatically log you out after 30 minutes of inactivity. Save your work regularly.

If you forget your password, click **Forgot password?** on the login page and follow the instructions sent to your email.

---

### 2.2 First-Time Setup (Admin only)

When your brokerage account is first created, the Admin must complete the onboarding wizard:

**Step 1 — Brokerage Profile**
- Enter your firm's legal name.
- Enter your **FSC Licence Number** (required for compliance).
- Upload your company logo (optional — appears in email notifications).

**Step 2 — MIPS Configuration**
- Enter your **MIPS Merchant ID** and **MIPS API Key** (obtained from mips.mu).
- Click **Test Connection** to verify the credentials work.

> **Security note:** Your MIPS API key is encrypted and stored securely. It is never displayed in full after saving.

**Step 3 — WhatsApp Setup**
- Enter your **WhatsApp Business number** (E.164 format: `+230 5700 0000`).
- Follow the on-screen instructions to connect your Meta WhatsApp Business account.

**Step 4 — Invite Agents**
- Enter the email addresses of your team members.
- Select their role: **Agent** or **Admin**.
- They will receive an invitation email to set their password.

---

### 2.3 Your Account Profile

To update your name, email, or password:
1. Click your **name** in the top-right corner.
2. Select **My Profile**.
3. Make your changes and click **Save**.

To set your **working hours** (used for appointment slot availability):
1. Go to **Settings → Calendar**.
2. Toggle each day on/off and set your start and end times.
3. Click **Save Hours**.

---

## 3. Dashboard

The Dashboard is your home screen. It gives you an at-a-glance view of everything that needs attention.

### 3.1 Key Performance Indicators (top row)

| Card | What it shows |
|---|---|
| **Policies Active** | Total active policies in your portfolio |
| **Renewals Due (45 days)** | Policies expiring within 45 days |
| **Revenue at Risk** | Total premium value of unrenewed expiring policies |
| **Payments Pending** | MIPS payment links sent but not yet paid |

### 3.2 Renewal Pipeline (centre)

A Kanban board showing all current renewals across five columns:

| Column | Meaning |
|---|---|
| **J-45 Sent** | First renewal message sent, awaiting client response |
| **J-30 Sent** | Second reminder sent |
| **J-15 Urgent** | Final reminder sent — needs personal follow-up |
| **Paid** | Client has paid via the MIPS link |
| **Lapsed** | Policy has expired without payment |

Click any card to open the full renewal detail.

### 3.3 Upcoming Appointments (right panel)

Lists your next 5 scheduled appointments. Click **View all** to open the full calendar.

### 3.4 Manager View (Admin only)

Admins see an additional tab: **Team Overview**, which shows each agent's:
- Number of active policies
- Renewals due in 30 days
- Commission at risk from unlapsed policies
- Number of appointments this week

---

## 4. Managing Clients

### 4.1 Viewing Your Client List

1. Click **Clients** in the left navigation menu.
2. Use the **search bar** to find a client by name, email, or NIC number.
3. Filter by **assigned agent**, **client type** (individual / company), or **policy type**.

### 4.2 Adding a New Client

1. Click **Clients → + Add Client**.
2. Fill in the client details:

| Field | Notes |
|---|---|
| **First Name / Last Name** | Or **Company Name** if client type is Company |
| **NIC Number** | National Identity Card number (kept confidential) |
| **Mobile Number** | Include country code: `+230 5700 0000` |
| **WhatsApp Number** | Leave blank if same as mobile |
| **Email** | Used for renewal emails and receipts |
| **Language Preference** | English or French — controls the language of automated messages |
| **Communication Preference** | Choose Email, WhatsApp, or both |

3. Click **Save Client**.

> **Tip:** Getting the WhatsApp number right is critical — this is where renewal reminders are sent. Always confirm the number with the client.

### 4.3 Client Profile

The client profile page shows everything in one view:
- **Details tab** — contact information, NIC, language preference.
- **Policies tab** — all policies held by this client.
- **Communications tab** — a full history of every email and WhatsApp message sent.
- **Documents tab** — uploaded policy schedules, ID copies, inspection reports.
- **Appointments tab** — past and upcoming bookings.

### 4.4 Editing a Client

1. Open the client profile.
2. Click **Edit** (top-right).
3. Make your changes and click **Save**.

All changes are logged in the audit trail.

### 4.5 Adding a Note

On any client profile:
1. Scroll to the **Notes** section.
2. Type your note.
3. Click **Save Note**.

Notes are visible to all agents in your brokerage.

---

## 5. Managing Policies

### 5.1 Viewing Policies

1. Click **Policies** in the navigation menu.
2. Filter by:
   - **Status**: Active / Draft / Lapsed / Renewed / Cancelled
   - **Expiry date range**: e.g., "expiring in the next 30 days"
   - **Insurer**: SWAN, MUA, Jubilee, etc.
   - **Product type**: Motor, Property, Life, Health, Liability, Marine, Fleet

### 5.2 Creating a New Policy

1. Go to the client's profile → **Policies tab** → **+ Add Policy**.
   *(Or go to Policies → + Add Policy and search for the client.)*

2. Fill in the policy details:

**Section A — Insurer & Product**

| Field | Notes |
|---|---|
| **Insurer** | Select from the list (SWAN, MUA, Jubilee, CIM, AML, BAI) |
| **Product Type** | Motor / Property / Life / Health / Liability / Marine / Fleet |
| **Product Name** | e.g., "Motor Comprehensive Plus" |

**Section B — Policy Terms**

| Field | Notes |
|---|---|
| **Policy Number** | The number assigned by the insurer |
| **Start Date** | Cover start date |
| **End Date** | Cover expiry date — this drives the renewal automation |
| **Premium Amount** | Annual premium in MUR |
| **Sum Insured** | Total insured value in MUR |
| **Excess Amount** | Client's excess amount in MUR |
| **Cover Type** | e.g., Comprehensive, Third Party, Third Party Fire & Theft |
| **Payment Frequency** | Annual / Semi-Annual / Quarterly / Monthly |

**Section C — Asset Details**

| Field | Notes |
|---|---|
| **Asset Description** | e.g., "Toyota Vios B 1234" or "Villa at Balaclava" |
| **Vehicle Details** | Make, Model, Year, Registration (for motor policies) |

**Section D — Broker Commission**

| Field | Notes |
|---|---|
| **Commission %** | Your agreed commission rate |
| **Commission Amount** | Auto-calculated from premium × rate |

**Section E — Inspection**

| Field | Notes |
|---|---|
| **Inspection Required?** | Toggle ON if insurer requires inspection before cover |

3. Click **Save Policy**.

> **What happens next:** The system automatically creates a renewal record and sets reminder trigger dates at **J-45**, **J-30**, and **J-15** before the policy end date.

### 5.3 Uploading a Policy Document

1. Open the policy detail page.
2. Click **Documents → Upload**.
3. Select the file (PDF recommended, max 20 MB).
4. Choose the document type: Policy Schedule / Cover Note / Other.
5. Click **Upload**.

The document is stored securely and accessible to all agents in your brokerage.

### 5.4 Policy Status Lifecycle

```
DRAFT → ACTIVE → RENEWED (when renewal payment received)
                → LAPSED  (if J-0 passes with no payment)
                → CANCELLED (manually cancelled)
                → CLAIMED (claim in progress)
```

To change a policy status manually:
1. Open the policy.
2. Click **Change Status** (admin only for Lapsed → Active reinstatement).
3. Select the new status and add a note explaining the reason.

---

## 6. Booking Appointments

### 6.1 Appointment Types

| Type | When to use |
|---|---|
| **Vehicle Inspection** | Before issuing a motor policy — insurer requires inspection of the vehicle |
| **Building Survey** | Before issuing property cover — surveyor assesses the risk |
| **Risk Audit** | For commercial clients — full risk assessment by video or in-person |
| **General Meeting** | General client meeting (onboarding, renewal discussion, etc.) |

### 6.2 Booking an Appointment

**Option A — Broker books for the client:**
1. Go to **Appointments → + Book Appointment**.
2. Select the **client** and **policy** (if applicable).
3. Choose the **appointment type** and **format** (In-person or Video call).
4. Select a date and time from your available slots.
5. If in-person: enter the **location**.
6. If video: a meeting link will be auto-generated.
7. Add any **pre-appointment instructions** for the client.
8. Click **Book** — the client receives a confirmation email and WhatsApp message with a calendar attachment.

**Option B — Client books via self-service link:**
1. Go to **Appointments → Share Booking Link**.
2. Copy the link and send it to your client (WhatsApp, email, or SMS).
3. The client opens the link, selects a slot, and confirms — no login required.
4. You receive a notification when the booking is confirmed.

### 6.3 Managing Appointments

The **Appointment Calendar** (click **Appointments** in the menu) shows all bookings in a weekly or monthly view.

Click any appointment to:
- **View details** — client, type, format, time, location/video link.
- **Add post-appointment notes** — record the inspection outcome.
- **Upload inspection report** — attach the report PDF.
- **Mark as Completed / No-Show / Cancelled**.

> **Day-before reminder:** The system automatically sends a reminder to the client the day before their appointment. You do not need to do anything.

### 6.4 Linking an Appointment to a Policy

If the appointment results in a policy being issued:
1. Open the appointment.
2. Click **Link to Policy** and search for the policy.
3. If the inspection is complete and satisfactory, toggle **Inspection Completed** on the policy record.

---

## 7. Payment Links

### 7.1 What is a MIPS Payment Link?

A MIPS payment link is a secure URL that takes your client directly to a hosted payment page where they can pay by:
- **Juice** (MCB Juice / SBM Juice)
- **Credit or debit card** (Visa / Mastercard)

When the client pays, the system is notified automatically and the policy status is updated. You never handle card details.

### 7.2 Generating a Payment Link

1. Open a **policy** or a **renewal record**.
2. Click **Generate Payment Link**.
3. Enter the details:

| Field | Notes |
|---|---|
| **Amount (MUR)** | The premium amount — pre-filled from the policy |
| **Description** | Shown to the client on the payment page |
| **Payment type** | Full payment or Instalment (e.g., "1 of 4") |
| **Link expiry** | How long the link stays active (default: 30 days) |

4. Click **Generate**.
5. The link appears — you can:
   - **Copy** and paste into WhatsApp manually.
   - **Send via Email** — opens a pre-filled email with the link embedded.
   - **Send via WhatsApp** — opens a pre-filled WhatsApp message (requires WhatsApp Business setup).
   - **Attach to Renewal** — automatically includes the link in the next renewal message.

### 7.3 Tracking Payments

Go to **Payments** in the navigation menu to see all payment links with their status:

| Status | Meaning |
|---|---|
| **Pending** | Link sent, client has not yet paid |
| **Paid** | Payment confirmed by MIPS |
| **Expired** | Link has passed its expiry date |
| **Failed** | Payment attempted but failed |

When a payment is confirmed, you receive an in-app notification and the client automatically receives a receipt email.

### 7.4 Payment History

On any policy page, click the **Payments** tab to see the full payment history for that policy, including each MIPS transaction reference for reconciliation.

---

## 8. Renewal Pipeline

The renewal pipeline is the heart of InsurLink MU. It ensures no policy lapses because of a missed reminder.

### 8.1 How Renewal Automation Works

Every morning at 8:00 AM, the system checks all active policies and automatically sends renewal reminders based on the expiry date:

| Trigger | When | What is sent |
|---|---|---|
| **J-45** | 45 days before expiry | Friendly renewal reminder + MIPS payment link |
| **J-30** | 30 days before expiry | Follow-up reminder (more urgent tone) |
| **J-15** | 15 days before expiry | Urgent notice + broker is notified to follow up personally |
| **J-0** | On expiry date | Lapse notice to client + critical alert to broker |

Messages are sent in the **client's preferred language** (English or French) via their **preferred channels** (email and/or WhatsApp).

### 8.2 Renewal Pipeline View

Go to **Renewals** to see the Kanban board with all your renewals in progress.

**Reading the pipeline:**
- Each card shows: client name, policy type, insurer, expiry date, premium amount.
- **Red border** = lapsed or J-15 reached with no payment.
- **Orange border** = J-30 reached with no payment.
- **Green** = payment received.

**Filtering the pipeline:**
- Use the filter bar to show only your assigned renewals.
- Admin can toggle to see all agents' renewals.

### 8.3 Renewal Detail Page

Click any renewal card to open the full detail:

- **Timeline** — shows exactly which messages were sent and when.
- **Message previews** — click any sent message to see exactly what the client received.
- **Payment link** — shows the generated MIPS link and its current status.
- **Agent notes** — add notes about your conversations with the client.
- **Manual send** — resend any reminder message manually if needed.

### 8.4 Manually Sending a Renewal Message

If you want to send a renewal message outside the automated schedule:
1. Open the renewal detail.
2. Click **Send Message Now**.
3. Choose the message template (J-45, J-30, J-15, or custom).
4. Preview the message — you can edit the text before sending.
5. Select channels (Email, WhatsApp, or both).
6. Click **Send**.

The system logs the message and records it in the communication timeline.

### 8.5 When a Client Pays

When MIPS confirms payment:
1. The renewal status changes to **Paid** automatically.
2. The policy status updates to **Renewed**.
3. A new policy period is created (start = old expiry + 1 day).
4. The new renewal triggers are set for the following year.
5. The client receives a payment receipt email.
6. You receive an in-app notification.

**You do not need to do anything manually.**

### 8.6 Handling a Lapsed Policy

If a policy lapses (J-0 passes with no payment):
1. You receive a **critical alert** in the app and by email.
2. The policy appears in your **Lapsed** tab under Policies.
3. Contact the client immediately — they have a coverage gap.
4. When the client agrees to reinstate, generate a new payment link.
5. Once paid, an Admin can change the policy status back to **Active** and adjust dates.

---

## 9. Settings

### 9.1 Brokerage Profile (Admin only)

**Settings → Brokerage Profile**

| Setting | Description |
|---|---|
| **Firm Name** | Displayed in all client communications |
| **FSC Licence Number** | Your FSC registration — required |
| **Logo** | Appears in email headers (PNG/JPG, max 2 MB) |
| **Phone** | Displayed in email footers |
| **Address** | Displayed in email footers |

### 9.2 MIPS Configuration (Admin only)

**Settings → Payments → MIPS**

| Setting | Description |
|---|---|
| **Merchant ID** | Your MIPS merchant identifier |
| **API Key** | Your MIPS API secret — stored encrypted |
| **Test Connection** | Validates credentials against the MIPS API |

> To update your MIPS credentials, enter the new values and click **Save**. The old key is overwritten.

### 9.3 WhatsApp Setup (Admin only)

**Settings → Notifications → WhatsApp**

| Setting | Description |
|---|---|
| **Business Phone Number** | Your WhatsApp Business number (E.164 format) |
| **Access Token** | Meta WhatsApp API token |
| **Send Test Message** | Sends a test WhatsApp to your own number |

### 9.4 Notification Templates (Admin only)

**Settings → Notification Templates**

You can customise the text of every automated message:
1. Select the template (e.g., **Renewal J-45 — Email — English**).
2. Edit the subject and body. Use `{{variable_name}}` to insert dynamic content.
3. Click **Preview** to see a sample with test data.
4. Click **Save**.

**Available variables:**

| Variable | Replaced with |
|---|---|
| `{{client_name}}` | Client's full name |
| `{{policy_type}}` | Product name (e.g., Motor Comprehensive) |
| `{{policy_number}}` | Insurer policy number |
| `{{insurer_name}}` | Insurer name (e.g., SWAN Insurance) |
| `{{expiry_date}}` | Policy expiry date (e.g., 15 Jun 2026) |
| `{{premium_amount}}` | Premium in MUR (e.g., 24,500.00) |
| `{{payment_link}}` | The MIPS payment URL |
| `{{agent_name}}` | Your name |
| `{{agent_phone}}` | Your phone number |
| `{{brokerage_name}}` | Your firm's name |

> **Important:** Do not remove required variables from templates — the system will not send a message if a required variable is missing.

### 9.5 Agent Management (Admin only)

**Settings → Team**

To **invite a new agent**:
1. Click **Invite Agent**.
2. Enter their email address and select their role (Agent or Admin).
3. Click **Send Invite** — they receive an email to set their password.

To **deactivate an agent** (e.g., when someone leaves):
1. Click the agent's name in the list.
2. Click **Deactivate**.
3. Reassign their clients to another agent (you will be prompted).

To **change an agent's role**:
1. Click the agent's name.
2. Click **Edit Role**.
3. Select the new role and confirm.

### 9.6 Calendar Settings (Each Agent)

**Settings → Calendar**

Set your available days and hours for appointment booking:
1. Toggle each day of the week on or off.
2. For active days, set your start and end times.
3. Set your **timezone** (default: Indian/Mauritius — UTC+4).
4. Click **Save**.

Your availability is used when clients book via the self-service booking link.

### 9.7 Audit Log (Admin only)

**Settings → Audit Log**

The audit log records every significant action in the platform — required for FSC compliance. You can:
- Filter by **date range**, **action type**, or **agent**.
- Export to CSV for regulatory reporting.
- View the "before" and "after" state for any record change.

Records are retained for **7 years** in line with the Financial Services Act requirements.

---

## 10. Frequently Asked Questions

**Q: A client says they didn't receive their renewal WhatsApp — what do I do?**

A: First, check their **Communication History** on their profile — you will see if the message was sent and whether it was delivered. Common reasons for non-delivery: wrong WhatsApp number, client's phone is off, or their WhatsApp number differs from their mobile. Update the WhatsApp number and use **Manual Send** to resend the message.

---

**Q: A client paid but the policy still shows as "Pending" — what happened?**

A: Payment confirmation from MIPS usually takes a few seconds. Wait 2 minutes and refresh the page. If it still shows pending, go to **Payments** and find the link — if it shows "Paid," click **Sync** to manually trigger the update. If the link shows "Pending" and the client has a receipt from MIPS, contact support with the MIPS transaction reference.

---

**Q: Can I disable automated reminders for a specific client?**

A: Currently, automated reminders apply to all active policies. If a client requests no WhatsApp messages, remove their WhatsApp number from their profile — reminders will still go by email only. A per-client opt-out feature is on the Phase 2 roadmap.

---

**Q: A policy was renewed with a different insurer — how do I record this?**

A: Create a new policy record with the new insurer and the new policy number. Set the start date to the day after the old policy expired. The old policy status will change to "Renewed" automatically when the payment is received (if via MIPS), or you can manually update it. Do not edit the old policy record.

---

**Q: How do I handle a mid-term cancellation?**

A: Open the policy, click **Change Status**, and select **Cancelled**. Add a note with the cancellation reason and effective date. If a refund is due, generate a MIPS refund through your MIPS merchant portal (outside InsurLink MU for MVP).

---

**Q: The client wants to pay in instalments — can I do that?**

A: Yes. Generate multiple payment links — one for each instalment — using the **Instalment** option when creating the link (e.g., "Payment 1 of 4 — MUR 6,125"). Send each link at the due date. Full instalment scheduling automation is on the Phase 2 roadmap.

---

**Q: Can a client log in and see their own policies?**

A: Not in the current MVP. A client-facing portal is planned for Phase 3.

---

**Q: How do I export my client list or policy data?**

A: Go to **Clients** or **Policies**, apply any filters you need, then click **Export → CSV**. The export respects your current filter selection.

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Brokerage** | The insurance broker firm using InsurLink MU |
| **Agent** | An individual broker or staff member who manages clients and policies |
| **Admin** | An agent with full access, including settings and all team data |
| **Client** | An individual or company whose policies are managed by the brokerage |
| **Policy** | An insurance contract between the client and an insurer |
| **Insurer** | The insurance company underwriting the policy (e.g., SWAN, MUA, Jubilee) |
| **Premium** | The amount the client pays for their insurance coverage |
| **Sum Insured** | The maximum amount the insurer will pay in the event of a claim |
| **Excess** | The amount the client must pay themselves before the insurer pays a claim |
| **Renewal** | The process of extending a policy for a new period when the current one expires |
| **J-45 / J-30 / J-15 / J-0** | Days before policy expiry when automated reminders are triggered |
| **Lapsed** | A policy that has expired without renewal payment — the client has no coverage |
| **MIPS** | Mauritius Inter-Bank Payment System — the local digital payment infrastructure |
| **Juice** | MCB or SBM mobile payment app — supported by MIPS |
| **Payment Link** | A URL that takes the client to a hosted MIPS payment page |
| **FSC** | Financial Services Commission — the regulator for insurance brokers in Mauritius |
| **NIC** | National Identity Card — the Mauritian national ID document |
| **BRN** | Business Registration Number — for company clients |
| **Cover Note** | A temporary document confirming insurance cover while the policy schedule is being prepared |
| **Policy Schedule** | The full official insurance policy document issued by the insurer |
| **Inspection** | A physical assessment of a vehicle or property required by some insurers before cover is issued |
| **Risk Audit** | A comprehensive assessment of a client's risks, typically done by video for commercial clients |
| **Audit Trail** | An automatic log of every change made in the platform — required for FSC compliance |
| **WhatsApp Business API** | Meta's official API for sending WhatsApp messages from business platforms |

---

*InsurLink MU — Built for Mauritian Insurance Brokers*
*Support: support@insurlink.mu | Tel: +230 xxxx xxxx*
