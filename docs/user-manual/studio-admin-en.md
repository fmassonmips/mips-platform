# Studio Admin User Manual (English)

For studio owners, instructors, and front-desk staff. This guide walks you through running your studio day-to-day on the MIPS Booking & Payment Engine.

> 🇫🇷 Version française : [`studio-admin-fr.md`](./studio-admin-fr.md)

## Contents
1. [Roles and access](#1-roles-and-access)
2. [Logging in](#2-logging-in)
3. [The "Today" screen](#3-the-today-screen)
4. [Publishing the weekly schedule](#4-publishing-the-weekly-schedule)
5. [Editing or cancelling a class](#5-editing-or-cancelling-a-class)
6. [Checking customers in](#6-checking-customers-in)
7. [Managing customers](#7-managing-customers)
8. [Issuing refunds](#8-issuing-refunds)
9. [Manual credit adjustments](#9-manual-credit-adjustments)
10. [Tracking revenue](#10-tracking-revenue)
11. [Notifications](#11-notifications)
12. [Settings](#12-settings)
13. [The retention loop in practice](#13-the-retention-loop-in-practice)
14. [Common questions](#14-common-questions)

---

## 1. Roles and access

| Role | Can do |
|---|---|
| **Owner** | Everything: schedule, customers, refunds, settings, revenue |
| **Instructor** | View own classes, check in customers, view today's schedule |
| **Front-desk** | View today's classes, check in customers |
| **Admin** (platform) | Cross-studio operations (only assigned to MIPS staff) |

Your studio owner creates accounts for instructors and front-desk. They can change roles anytime from **Settings → Team**.

## 2. Logging in

1. Go to `https://app.mips.studio/login`.
2. Enter your email and password.
3. You stay logged in for 12 hours; the session refreshes as you click.

> 🔒 After 10 failed attempts in 15 minutes, your account is locked for 30 minutes. If this happens, wait or contact MIPS support.

## 3. The "Today" screen

Your home screen when you log in.

You see:
- **Today's classes**, in chronological order. Each card shows: time, instructor, room, capacity, current bookings, no-shows so far.
- A **Check-in** button on each class.
- A side panel: today's revenue, today's no-shows, today's refunds.

Tap any class to drill into the attendance view.

## 4. Publishing the weekly schedule

**Schedule → Week view → Sunday night routine:**

1. Click **Clone last week** to copy last week's classes into next week.
2. Review each day; adjust capacity or instructor where needed.
3. Add a new class: click an empty slot → fill in class type, instructor, room, capacity → **Save as draft**.
4. When done, click **Publish week** — customers can now see and book.

> 💡 Classes start in **DRAFT** until you publish. Drafts are invisible to customers.

You can edit a published class anytime. Customers who already booked see updates automatically.

## 5. Editing or cancelling a class

### Editing

1. From the week view, click the class.
2. Edit the fields. Note:
   - You **cannot** reduce capacity below the current number of bookings — first cancel specific bookings.
   - Changing time or instructor automatically notifies booked customers.

### Cancelling a class

1. From the class detail, click **Cancel class**.
2. Confirm. All confirmed bookings:
   - Are **fully refunded** via MIPS reversal.
   - Customers receive an SMS + email apology with the refund notice.
3. The slot is greyed out on the calendar.

This action is **logged in the audit log** and cannot be undone.

## 6. Checking customers in

Open the class on the **Today** screen → **Check-in**.

You see a list of confirmed customers. For each:
- Tap **Present** when they arrive.
- Tap **No-show** at end-of-class for anyone absent.

If you forget to mark no-shows, the system marks them automatically 1 hour after class ends.

> 💡 Walk-ins without booking: from check-in → **Add walk-in** → search customer or create new → choose payment (cash or MIPS).

## 7. Managing customers

**Customers** tab:

- **Search** by name or phone.
- **Filter** by status:
  - `Active` — recently attended, has balance.
  - `Low balance` — 1 session left. Your re-sell targets.
  - `Inactive` — no class attended in 60+ days.
  - `Expired` — packages expired with no renewal.
- **Export** to CSV for marketing tools.

### Customer profile

Click any customer to see:
- Contact info, current status, lifetime stats.
- **Bookings** tab — full history.
- **Payments** tab — all transactions, refundable from here.
- **Notifications** tab — what messages were sent, when, delivery status.
- **Manual adjustments** tab — audit trail of credits you added.

## 8. Issuing refunds

From a confirmed booking or payment:

1. Click **Refund**.
2. Choose mode:
   - **Full refund** — money back via MIPS to the original payment method; session re-credited.
   - **Partial refund** — refund part of a package purchase (e.g. 2 unused sessions of a 5-pack).
   - **Credit only** — re-credit the session, keep the money. Useful for goodwill.
3. Add an internal reason (free text). Mandatory for audit.
4. Confirm.

The customer receives an email notice. The refund appears on their card or Juice within 5 business days (MIPS-dependent).

> ⚠️ Refunds are logged in the audit log with your name, the reason, and a timestamp. They cannot be deleted.

## 9. Manual credit adjustments

For goodwill, errors, or comp sessions:

1. Customer profile → **Add credit**.
2. Enter sessions to add (or remove, with negative number).
3. Enter a reason.
4. Confirm.

The credit appears immediately in the customer's balance. They receive no automatic notification — write them yourself if appropriate.

## 10. Tracking revenue

**Revenue** tab:

- **This week / month / custom range**.
- Stacked bars: revenue by payment method (Juice / Card / Cash / Comp).
- Refunds shown as negative bars.
- **Net revenue** column = gross minus MIPS fees.
- CSV export for accounting.

> 💡 The morning reconciliation report is emailed to you daily if any discrepancy is detected between our records and MIPS settlement. Open the email — that's an incident.

## 11. Notifications

The platform sends automated messages to your customers (see customer manual). You can:

- **Settings → Notifications** — turn off the 24h email reminder if your customers find it noisy. The 2h SMS, booking confirmation, and refund notice cannot be turned off (transactional).
- **Customers → profile → Notifications tab** — see what was sent and whether it was delivered.
- A customer with red badges (bounced email or undeliverable SMS) needs a phone call.

## 12. Settings

Studio settings live in **Settings**.

### Studio info
- Name, logo, public URL handle (e.g. `lea-pilates`), contact info.

### Packages
- Create / edit / archive packages. Examples: Drop-in MUR 450 / 1 day, 5-pack MUR 2,000 / 60 days, 10-pack MUR 3,500 / 90 days.
- Archived packages remain valid for existing customers but disappear from purchase options.

### Policies
- **Cancellation free window** (hours before class). Default 12.
- **Cutoff** (minutes before class when bookings close). Default 15.
- **No-show**: does it consume a session? Default yes.

### Notifications
- Toggle 24h reminder. Edit copy (text + email) — you can override the platform defaults.

### Team
- Add staff: enter email + role. They receive an email to set their password.
- Change roles, deactivate users.

### MIPS credentials
- Your merchant ID and webhook secret. Don't change without coordinating with MIPS support.

## 13. The retention loop in practice

This is the wedge that distinguishes this platform from a generic calendar.

**The trigger**: when a customer's last booking brings their remaining sessions to 1.

**What happens automatically**:
- They receive an SMS and an email with a one-tap renewal link.
- If they had a saved card, the renewal is instant: they tap the link, the package is renewed, they book the next class.

**What you should watch**:
- In **Revenue**, you'll see "Renewal" rows tagged. Track the ratio of low-balance triggers → renewals.
- In the **Customers** tab, the `Low balance` filter shows your hot list — these are people you can call personally if the automation doesn't convert them.

**Best practice**: don't manually re-engage someone within 7 days of the automated message. Let it work, then call those it didn't convert.

## 14. Common questions

**Q: A customer claims they paid but their booking is not confirmed.**
A: Look up their phone in **Customers**, open their **Payments** tab. If the payment shows `PENDING` for more than 10 minutes, the system will auto-reconcile within 5 minutes. If it shows `FAILED`, ask them to re-pay. If unclear, contact MIPS support with the `payment_id`.

**Q: I want to comp a class for a VIP.**
A: **Add credit** with `sessions = +1, reason = "Comp"`. No money flow, audit-logged.

**Q: A class has 12 bookings but only 11 mats arrived.**
A: Edit the class capacity from 12 to 11. The system blocks the reduction because of the existing bookings — first cancel one specific booking, then reduce.

**Q: A customer cancels at the boundary of the free window.**
A: The server clock decides. If they cancelled at 11:59:59 for a class 12 hours later — credit returned. If at 12:00:01 — consumed. There is no override.

**Q: Can I see who unsubscribed from notifications?**
A: Yes — customer profile shows red badges next to SMS / Email if the customer opted out or their address bounced.

**Q: Can I send a marketing campaign?**
A: Not in the MVP. Export the `Inactive` customer list to CSV and use your usual tool. Marketing automation is Phase 2.

---

Need anything that isn't here? Tell your MIPS contact — pilot studios shape the next release.
