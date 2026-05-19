# Notifications

The retention layer. Every customer-facing message — transactional or marketing-adjacent — flows through one outbox.

## 1. Design principles

- **Single outbox**: every send is a row in `notification`. No fire-and-forget.
- **Idempotent on (customer_id, template_key, dedup_key)**: prevents duplicate sends if a producer retries.
- **Worker-driven**: producers `INSERT`, workers `SEND`. Producers never call SMS/email APIs directly.
- **Localized**: each template has FR and EN variants; resolved by `customer.locale`.
- **Capped**: ≤ 3 messages per booking, ≤ 1 retention message per customer per 7 days. Hard caps enforced in the producer.
- **Auditable**: hard bounces toggle `customer.sms_contactable` / `email_contactable` to false and surface in admin.

## 2. Channels

| Channel | Provider | Fallback |
|---|---|---|
| SMS | Local aggregator (Mauritius, fr/en) | Twilio |
| Email | Postmark | SES |

The provider abstraction lives in `src/Notification/Channels/*`. Failure of the primary provider on a single send falls through to the fallback. Persistent failure pages the on-call.

## 3. Templates

Each template has a key like `low_balance.fr`. Files in `resources/notifications/{template_key}.blade.php` (text) and `.html.blade.php` (email HTML).

### 3.1 `booking_confirmed`

**Trigger**: payment success → booking → CONFIRMED.
**Channels**: SMS + email.

FR — SMS:
> Confirmé ✓ {{class_type}} le {{date_fr}} à {{time}}. Salle {{room}}, instructrice {{instructor}}. À bientôt !

FR — Email subject: *Ta séance est confirmée — {{date_fr}}*

EN — SMS:
> Confirmed ✓ {{class_type}} on {{date_en}} at {{time}}. Room {{room}}, instructor {{instructor}}. See you soon!

### 3.2 `class_reminder_24h`

**Trigger**: 24h before class start.
**Channels**: email only.

FR subject: *Demain à {{time}} — {{class_type}}*
EN subject: *Tomorrow at {{time}} — {{class_type}}*

### 3.3 `class_reminder_2h`

**Trigger**: 2h before class start.
**Channels**: SMS only.

FR:
> 📍 Rappel : {{class_type}} aujourd'hui à {{time}} chez {{studio_name}}. À tout à l'heure !

EN:
> 📍 Reminder: {{class_type}} today at {{time}} at {{studio_name}}. See you shortly!

### 3.4 `low_balance` — **the retention loop**

**Trigger**: on `booking_confirmed`, when `SUM(remaining sessions across active credits) == 1`.
**Channels**: SMS + email.
**Cap**: max once per customer per 7 days.

FR — SMS:
> Il te reste 1 session sur ton forfait. Clique ici pour réserver ton prochain cours avant qu'il ne soit complet : {{renew_url}}

FR — Email subject: *Plus qu'une séance — on renouvelle ?*
FR — Email body:
> Bonjour {{first_name}},
>
> Il te reste **1 session** sur ton forfait actuel. Pour ne pas perdre ton rythme :
>
> - 👉 [Réserver ton prochain cours]({{book_url}})
> - 🔁 [Renouveler ton forfait en 1 clic]({{renew_url}}) (paiement {{payment_method_hint}})
>
> À très vite chez {{studio_name}}.

EN — SMS:
> You have 1 session left. Tap here to book your next class before it fills up: {{renew_url}}

EN — Email subject: *Just one session left — renew?*

The `renew_url` deep-links to the renewal flow. If the customer has a saved card token, the URL one-taps via `/payments/one-tap-renew`. Otherwise it lands on the package picker.

### 3.5 `expiring_soon`

**Trigger**: 7 days before `package_credit.expires_at` AND `remaining > 0`.
**Channels**: email only.

FR subject: *Ton forfait expire dans 7 jours*
EN subject: *Your package expires in 7 days*

### 3.6 `studio_cancelled`

**Trigger**: studio cancels a class.
**Channels**: SMS + email. **Bypasses the retention cap.**

FR — SMS:
> ⚠️ Le cours {{class_type}} du {{date_fr}} {{time}} est annulé par le studio. Ton paiement est remboursé. Désolé pour le désagrément.

### 3.7 `refund_issued`

**Trigger**: manual refund by admin.
**Channels**: email only.

### 3.8 `package_purchased`

**Trigger**: package payment success.
**Channels**: email.

## 4. Producer rules

Producers live next to the events that fire them:

| Producer | File | When |
|---|---|---|
| Booking confirmation | `src/Payment/MipsWebhookHandler.php` | inside the confirmation tx |
| Low-balance check | same | inside the same tx, after debit |
| Pre-class reminders | `src/Notification/PreClassScheduler.php` (cron) | runs every 5 min |
| Expiry warnings | `src/Notification/ExpiryScheduler.php` (cron) | runs daily 09:00 studio time |
| Studio cancel | `src/Booking/StudioCancelService.php` | inside the cancel tx |
| Refund | `src/Payment/RefundService.php` | inside the refund tx |

Producers write to `notification` with `status='QUEUED'`, never call providers directly.

## 5. Dedup key

To make producer retries safe, each insert sets `dedup_key`:

```
booking_confirmed   →  "bc:" + booking_uuid
class_reminder_24h  →  "r24:" + booking_uuid
class_reminder_2h   →  "r2:"  + booking_uuid
low_balance         →  "lb:"  + customer_uuid + ":" + iso_week
expiring_soon       →  "exp:" + package_credit_uuid
studio_cancelled    →  "sc:"  + booking_uuid
refund_issued       →  "rf:"  + payment_uuid
package_purchased   →  "pp:"  + package_credit_uuid
```

`dedup_key` is a UNIQUE column on `notification`. Insert-or-ignore semantics: a second insert is a no-op.

## 6. Worker

`php bin/worker notifications` runs as a long-lived process under `supervisord`.

```
loop:
  poll: SELECT * FROM notification
        WHERE status='QUEUED' AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT 50 FOR UPDATE SKIP LOCKED;

  for each row:
    UPDATE row SET status='SENDING';
    render template with payload_json + customer.locale;
    call provider (with retry 3x exp backoff);
    if success: UPDATE status='SENT', provider_message_id, sent_at=NOW();
    if failure: attempts++; if attempts < 3 keep QUEUED, else SET status='FAILED';
```

`SKIP LOCKED` lets multiple workers run in parallel without stepping on each other.

## 7. Delivery receipts

`POST /api/v1/webhooks/sms-status` and `/email-status` update the `notification` row:

```sql
UPDATE notification
SET status = :status,        -- SENT | BOUNCED
    last_error = :err
WHERE provider_message_id = :pmid;
```

On `BOUNCED`:
- Email: `customer.email_contactable = 0`.
- SMS hard bounce: `customer.sms_contactable = 0`.

The producer checks these flags before queueing:

```php
if ($channel === 'SMS' && !$customer->sms_contactable) return;
if ($channel === 'EMAIL' && !$customer->email_contactable) return;
```

## 8. Quiet hours

SMS is suppressed between 21:00 and 07:00 studio time, **except** for `studio_cancelled` and `class_reminder_2h` for classes starting before 09:00.

Implementation:

```php
if ($channel === 'SMS' && !$template->is_urgent) {
    $studioNow = now()->setTimezone($studio->timezone);
    if ($studioNow->hour >= 21 || $studioNow->hour < 7) {
        $scheduled_at = $studioNow->next(7)->utc();   // 7am studio time
    }
}
```

## 9. Localization

`customer.locale` resolves to `fr-MU` or `en-MU`. Falls back to `fr-MU` if unset.

Templates use Laravel localization (or a homegrown loader pre-Laravel). Strings are externalized; no inline string concatenation in code.

## 10. Testing

- Each template has a snapshot test: render with a fixture payload, compare to expected output.
- Each producer has an integration test that asserts:
  - the right rows are inserted in the right channel/template,
  - dedup works (running twice = one row),
  - quiet hours and contactability flags are honored.

## 11. Metrics

| Metric | Alert threshold |
|---|---|
| `notification_queued_total{template}` | informational |
| `notification_sent_total{channel,template,outcome}` | informational |
| Send latency p95 (queued → sent) | > 5 min |
| SMS delivery rate (1h window) | < 90% → page on-call |
| Email bounce rate (1h window) | > 5% → page |
| Low-balance → renewal conversion (7d) | tracked for product, not alerting |

## 12. Compliance

- Every transactional message includes the studio name and a STOP keyword for SMS.
- Customers can opt out of non-transactional messages via account screen → `prefs.sms`/`prefs.email`.
- Hard cap remains for transactional (`booking_confirmed`, `studio_cancelled`, `refund_issued`) — these are not opt-outable.
- 30-day data retention on `notification.payload_json` (no need to keep template variables forever); `status`, `provider_message_id` retained 1 year for dispute resolution.
