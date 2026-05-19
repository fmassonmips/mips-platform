# InsurLink MU — Technical Documentation
**Version 1.0 | For Developers & System Administrators**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Prerequisites & Dependencies](#2-prerequisites--dependencies)
3. [Installation & Setup](#3-installation--setup)
4. [Configuration Reference](#4-configuration-reference)
5. [Database Schema Reference](#5-database-schema-reference)
6. [Service Layer Reference](#6-service-layer-reference)
7. [Cron Jobs](#7-cron-jobs)
8. [Webhook Handling](#8-webhook-handling)
9. [Notification System](#9-notification-system)
10. [Security Architecture](#10-security-architecture)
11. [Routing & Controllers](#11-routing--controllers)
12. [Multi-Tenancy Model](#12-multi-tenancy-model)
13. [Production Deployment](#13-production-deployment)
14. [Monitoring & Logging](#14-monitoring--logging)
15. [Troubleshooting](#15-troubleshooting)
16. [Development Guide](#16-development-guide)

---

## 1. System Overview

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS (Browser / WhatsApp)             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────┐
│                     Nginx (reverse proxy)                        │
│               TLS termination · rate limiting                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   PHP 8.2 Application (FPM)                      │
│                                                                   │
│  public/index.php  →  Router  →  Controllers                     │
│                                    │                             │
│                          ┌─────────┴──────────┐                  │
│                          │    Service Layer    │                  │
│                    MipsService  NotifService  RenewalService      │
└──────┬───────────────────┬────────────────────┬─────────────────┘
       │                   │                    │
┌──────▼──────┐   ┌────────▼────────┐  ┌───────▼────────┐
│  MariaDB    │   │   MIPS API      │  │  Meta WA API   │
│  (primary)  │   │  (Mauritius)    │  │  + SMTP relay  │
└─────────────┘   └─────────────────┘  └────────────────┘

Cron (systemd timer, daily 08:00 MUT):
  tools/renewal_cron.php  →  RenewalService  →  NotificationService
```

### 1.2 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | PHP | 8.2+ |
| Web server | Nginx | 1.24+ |
| PHP process manager | PHP-FPM | 8.2 |
| Database | MariaDB | 10.11+ |
| In-process queue | MariaDB (`communications` table) | — |
| Email transport | PHPMailer + Sendgrid/SMTP | 6.x |
| WhatsApp | Meta Cloud API (WhatsApp Business) | v19.0 |
| Payment gateway | MIPS (Mauritius Inter-Bank Payment System) | REST v1 |
| Cron scheduler | systemd timer or crontab | — |
| Key encryption | OpenSSL AES-256-CBC | built-in |
| Session storage | PHP native (file-based) | — |
| Static assets | Nginx direct serve | — |

### 1.3 Directory Structure

```
mips-platform/
├── config/
│   └── config.php              # App configuration (copy, never commit secrets)
├── docs/
│   ├── MVP_ARCHITECTURE.md     # Product blueprint
│   ├── TECHNICAL_DOCUMENTATION.md  # This file
│   ├── USER_MANUAL_EN.md       # End-user guide (English)
│   └── USER_MANUAL_FR.md       # End-user guide (French)
├── public/
│   └── index.php               # Single entry point (front controller)
├── sql/
│   ├── schema.sql              # Full database schema
│   └── seed.sql                # Reference data + test user
├── src/
│   ├── Auth.php                # Authentication helpers
│   ├── Csrf.php                # CSRF token generation/validation
│   ├── Database.php            # PDO wrapper (singleton)
│   ├── RateLimiter.php         # Login attempt rate limiting
│   ├── Response.php            # HTTP response helpers
│   ├── Session.php             # Session management
│   ├── Validator.php           # Input validation
│   ├── bootstrap.php           # App bootstrap (autoload, config, DI)
│   ├── Controllers/
│   │   ├── LoginController.php
│   │   ├── LogoutController.php
│   │   ├── MeController.php
│   │   ├── RegisterController.php
│   │   ├── ClientController.php      # (Sprint 2)
│   │   ├── PolicyController.php      # (Sprint 2)
│   │   ├── AppointmentController.php # (Sprint 3)
│   │   ├── PaymentController.php     # (Sprint 4)
│   │   ├── RenewalController.php     # (Sprint 5)
│   │   └── WebhookController.php     # (Sprint 4) MIPS webhook
│   └── Services/
│       ├── MipsService.php
│       ├── NotificationService.php
│       └── RenewalService.php
├── templates/
│   ├── login.view.php
│   ├── register.view.php
│   └── dashboard.view.php
└── tools/
    ├── make_password_hash.php
    └── renewal_cron.php
```

---

## 2. Prerequisites & Dependencies

### 2.1 Server Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| PHP | 8.2 | 8.3 |
| MariaDB | 10.6 | 10.11 LTS |
| Nginx | 1.18 | 1.24 |
| RAM | 512 MB | 2 GB |
| Disk | 10 GB | 50 GB (document storage) |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| SSL | Let's Encrypt / commercial | EV certificate recommended |

### 2.2 PHP Extensions Required

```bash
php8.2-fpm
php8.2-mysql       # PDO_MySQL driver
php8.2-mbstring    # Multi-byte string (UTF-8)
php8.2-curl        # MIPS + WhatsApp API calls
php8.2-openssl     # AES-256 encryption
php8.2-json        # JSON encode/decode
php8.2-intl        # Date/locale formatting
```

### 2.3 Composer Dependencies

```json
{
    "require": {
        "phpmailer/phpmailer": "^6.9",
        "twig/twig": "^3.0"
    }
}
```

Install with:
```bash
composer install --no-dev --optimize-autoloader
```

### 2.4 External Service Accounts Required

| Service | Purpose | Obtained from |
|---|---|---|
| MIPS Merchant account | Payment link generation | mips.mu — apply as merchant |
| Meta WhatsApp Business API | WhatsApp notifications | developers.facebook.com |
| SMTP relay (Sendgrid/Brevo) | Email delivery | sendgrid.com or brevo.com |
| Object storage (optional) | Document uploads | Scaleway / AWS S3 |

---

## 3. Installation & Setup

### 3.1 Clone & Configure

```bash
# Clone repository
git clone https://github.com/fmassonmips/mips-platform.git
cd mips-platform

# Install PHP dependencies
composer install --no-dev --optimize-autoloader

# Copy config (edit values before proceeding)
cp config/config.php config/config.local.php
```

### 3.2 Database Setup

```bash
# Create database and schema
mysql -u root -p < sql/schema.sql

# Load reference data (insurers, templates, test user)
mysql -u root -p < sql/seed.sql

# Create application DB user (edit password)
mysql -u root -p -e "
  CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
  GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
  FLUSH PRIVILEGES;
"
```

### 3.3 Environment Variables

Create `/etc/mips-platform/.env` (readable by `www-data` only):

```ini
# Application
APP_URL=https://app.insurlink.mu
APP_ENV=production
APP_ENCRYPTION_KEY=<base64-encoded 32-byte random key>

# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=mips_platform
DB_USER=mips_user
DB_PASS=STRONG_PASSWORD_HERE

# MIPS (fallback for single-tenant; per-brokerage creds stored in DB)
MIPS_MERCHANT_ID=
MIPS_API_KEY=

# SMTP
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxx
MAIL_FROM=noreply@insurlink.mu
MAIL_FROM_NAME=InsurLink MU

# WhatsApp Business API
WA_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxx
WA_PHONE_NUMBER_ID=1234567890
```

Generate encryption key:
```bash
php -r 'echo base64_encode(random_bytes(32)) . PHP_EOL;'
```

Load `.env` in `bootstrap.php`:
```php
// Add to src/bootstrap.php
$env = parse_ini_file('/etc/mips-platform/.env');
foreach ($env as $k => $v) {
    $_ENV[$k] = $v;
}
```

### 3.4 Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name app.insurlink.mu;

    root /var/www/mips-platform/public;
    index index.php;

    ssl_certificate     /etc/letsencrypt/live/app.insurlink.mu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.insurlink.mu/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;

    # Block direct access to non-public directories
    location ~* ^/(src|config|sql|tools|docs)/ {
        deny all;
        return 404;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT   $realpath_root;
    }

    # Webhook endpoint — MIPS sends POST; no rate limit applied here
    location = /webhook/mips {
        try_files $uri /index.php?$query_string;
    }

    # Rate limit login attempts at Nginx level (belt-and-suspenders)
    location = /login {
        limit_req zone=login burst=10 nodelay;
        try_files $uri /index.php?$query_string;
    }

    client_max_body_size 20M;    # Allow document uploads up to 20 MB
}

# Rate limit zone (in http block)
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
```

### 3.5 File Permissions

```bash
# Application files — owned by deploy user, readable by www-data
chown -R deploy:www-data /var/www/mips-platform
chmod -R 750 /var/www/mips-platform

# Writable directories
mkdir -p /var/www/mips-platform/storage/{documents,logs}
chown -R www-data:www-data /var/www/mips-platform/storage
chmod -R 770 /var/www/mips-platform/storage

# Config — read-only for www-data
chmod 640 /etc/mips-platform/.env
chown root:www-data /etc/mips-platform/.env
```

---

## 4. Configuration Reference

### 4.1 `config/config.php`

| Key | Type | Default | Description |
|---|---|---|---|
| `app.name` | string | `'MIPS Dashboard'` | Application name shown in UI |
| `app.env` | string | `'production'` | `development` or `production` |
| `db.host` | string | `'127.0.0.1'` | MariaDB host |
| `db.port` | int | `3306` | MariaDB port |
| `db.name` | string | `'mips_platform'` | Database name |
| `db.user` | string | — | DB username |
| `db.pass` | string | — | DB password (use env var in prod) |
| `db.charset` | string | `'utf8mb4'` | Always `utf8mb4` |
| `session.name` | string | `'MIPSSESSID'` | Session cookie name |
| `session.lifetime` | int | `0` | `0` = until browser closes |
| `session.idle_timeout` | int | `1800` | Seconds of inactivity before logout |
| `session.secure` | bool | `true` | Must be `true` in production (HTTPS) |
| `session.httponly` | bool | `true` | Prevents JS access to session cookie |
| `session.samesite` | string | `'Lax'` | CSRF protection via SameSite |
| `security.password_min_length` | int | `8` | Minimum password length |
| `rate_limit.*` | mixed | — | Login rate-limiting thresholds |

### 4.2 Encryption Key Rotation

The `APP_ENCRYPTION_KEY` is used to decrypt MIPS API keys stored in `brokerages.mips_api_key_encrypted`. To rotate:

1. Decrypt all existing keys with the old key.
2. Re-encrypt with the new key.
3. Update the env var.
4. Restart PHP-FPM.

A migration script for key rotation is **not included in MVP** — add before storing production credentials.

---

## 5. Database Schema Reference

### 5.1 Entity Relationship Summary

```
brokerages ──< agents ──< clients ──< policies ──< renewals
                                              │──< payment_links ──< payment_events
                                              │──< appointments
                                              └──< documents

insurers ──< insurer_products ──< policies

clients ──< communications
renewals ──< communications

audit_log (references any entity by type + id)
notification_templates (keyed by template_key + channel + language)
```

### 5.2 Table Index Rationale

| Table | Key Index | Purpose |
|---|---|---|
| `policies` | `idx_policies_end_date` | Renewal cron: `WHERE end_date BETWEEN ... AND ...` |
| `renewals` | `idx_renewals_trigger_j45/30/15` | Cron: filter by trigger date columns |
| `payment_links` | `idx_payment_links_mips_ref` | Webhook: lookup by MIPS transaction reference |
| `communications` | `idx_communications_status` | Queue consumer: `WHERE status = 'queued'` |
| `appointments` | `idx_appointments_scheduled` | Reminder cron: `WHERE scheduled_at BETWEEN ...` |
| `audit_log` | `idx_audit_log_entity` | FSC audit: filter by entity_type + entity_id |

### 5.3 Soft Deletes Policy

The MVP schema uses **status fields** rather than soft-delete columns (`deleted_at`). This keeps queries simple and ensures the audit trail captures status changes (e.g., `policy.status = 'cancelled'`). Full delete from the UI is not exposed — records are only archived via status change.

### 5.4 JSON Column Conventions

| Table.Column | Schema | Example |
|---|---|---|
| `clients.communication_pref` | `string[]` | `["email","whatsapp"]` |
| `agents.working_hours_json` | `{day: [start, end]}` | `{"mon":["09:00","17:00"],"sat":["09:00","12:00"]}` |
| `policies.asset_metadata_json` | `{key: value}` | `{"make":"Toyota","model":"Vios","year":2021,"reg":"B1234"}` |
| `notification_templates.variables_json` | `string[]` | `["client_name","expiry_date","payment_link"]` |
| `payment_links.mips_webhook_payload` | raw MIPS object | full MIPS JSON payload |

---

## 6. Service Layer Reference

### 6.1 `MipsService`

**Namespace:** `App\Services\MipsService`

#### `createPaymentLink(array $params): array`

Creates a hosted MIPS payment page and returns the URL.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | float | Yes | Premium amount in MUR |
| `description` | string | Yes | Displayed on MIPS payment page (max 255 chars) |
| `reference` | string | Yes | Policy number or internal ref |
| `brokerage_id` | int | No | If set, uses brokerage's own MIPS credentials |

**Returns:** `['payment_url' => string, 'transaction_ref' => string]`

**Throws:** `RuntimeException` if MIPS API returns error or credentials are missing.

---

#### `verifyWebhookSignature(string $rawBody, string $signatureHeader, string $apiKey): bool`

Verifies MIPS webhook authenticity via HMAC-SHA256. **Always call this first** in `WebhookController` before processing any payment event.

```php
$raw  = file_get_contents('php://input');
$sig  = $_SERVER['HTTP_X_MIPS_SIGNATURE'] ?? '';
$key  = $brokerage['mips_api_key_decrypted'];

if (!$mips->verifyWebhookSignature($raw, $sig, $key)) {
    http_response_code(401);
    exit;
}
```

---

### 6.2 `NotificationService`

**Namespace:** `App\Services\NotificationService`

#### `send(string $templateKey, array $context, int $clientId, ?int $renewalId, ?int $appointmentId): void`

Renders a template and dispatches via all channels configured for the client (`communication_pref`). Queues the message in `communications` before attempting delivery — the record exists even if delivery fails.

| `$context` key | Required | Description |
|---|---|---|
| `language` | Yes | `'en'` or `'fr'` — selects template variant |
| `client_email` | For email | Recipient email address |
| `client_wa` | For WhatsApp | E.164 phone number e.g. `+23057000000` |
| All template `{{variables}}` | Yes | As defined in `notification_templates.variables_json` |

**Template key conventions:**

| Key | Trigger |
|---|---|
| `renewal_j45` | J-45 renewal reminder |
| `renewal_j30` | J-30 renewal reminder |
| `renewal_j15` | J-15 renewal reminder (escalation) |
| `renewal_j0` | Expiry day lapse notification |
| `appointment_confirm` | Appointment booking confirmation |
| `appointment_reminder` | Day-before appointment reminder |
| `payment_receipt` | Successful payment receipt |

---

### 6.3 `RenewalService`

**Namespace:** `App\Services\RenewalService`

#### Trigger methods

```php
$svc->triggerJ45(int $renewalId, array $context): void
$svc->triggerJ30(int $renewalId, array $context): void
$svc->triggerJ15(int $renewalId, array $context): void  // also escalates to agent
$svc->triggerJ0(int $renewalId, int $policyId, array $context): void  // lapses policy
```

Each method:
1. Calls `NotificationService::send()` with the appropriate template key.
2. Updates `renewals.jXX_sent_at` timestamp.
3. Advances `renewals.status` to `contacted` (or `lapsed` for J0).
4. Writes an `audit_log` entry.

#### `markPaid(int $renewalId, int $policyId, float $amountReceived): void`

Called by `WebhookController` after a verified `payment.success` event:
1. Sets `renewals.status = 'paid'`.
2. Sets `policies.status = 'renewed'`.
3. Creates a new policy record for the next coverage period (start = old end + 1 day).
4. Pre-creates the next year's renewal record with correct J-45/30/15 trigger dates.

#### `createRenewalRecord(int $policyId, string $endDate): int`

Creates a `renewals` row for a policy. Called automatically on:
- New policy creation (from `PolicyController`)
- `markPaid()` (for the new policy period)

---

## 7. Cron Jobs

### 7.1 Renewal Trigger Engine

**File:** `tools/renewal_cron.php`

**Schedule:** Daily at 08:00 Mauritius Time (UTC+4)

```bash
# /etc/cron.d/mips-renewals
0 8 * * * www-data /usr/bin/php /var/www/mips-platform/tools/renewal_cron.php >> /var/log/mips/renewal.log 2>&1
```

Or with systemd timer (`/etc/systemd/system/mips-renewal.timer`):

```ini
[Unit]
Description=InsurLink Renewal Trigger Engine

[Timer]
OnCalendar=*-*-* 08:00:00
TimeZone=Indian/Mauritius
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/mips-renewal.service
[Unit]
Description=InsurLink Renewal Cron

[Service]
Type=oneshot
User=www-data
ExecStart=/usr/bin/php /var/www/mips-platform/tools/renewal_cron.php
StandardOutput=append:/var/log/mips/renewal.log
StandardError=append:/var/log/mips/renewal.log
```

```bash
systemctl enable --now mips-renewal.timer
```

### 7.2 Appointment Reminder Engine

**File:** `tools/appointment_reminder_cron.php` *(to be created in Sprint 3)*

**Schedule:** Daily at 07:00 MUT

```bash
0 7 * * * www-data /usr/bin/php /var/www/mips-platform/tools/appointment_reminder_cron.php >> /var/log/mips/appointments.log 2>&1
```

**Logic:** Queries `appointments` where `scheduled_at` is within the next 24 hours and `reminder_sent = 0`, dispatches confirmation message, sets `reminder_sent = 1`.

### 7.3 Communication Queue Consumer

**File:** `tools/queue_worker.php` *(to be created in Sprint 5)*

**Schedule:** Every 2 minutes

```bash
*/2 * * * * www-data /usr/bin/php /var/www/mips-platform/tools/queue_worker.php >> /var/log/mips/queue.log 2>&1
```

**Logic:** Processes `communications` rows where `status = 'queued'`, retries failed messages up to 3 times with exponential backoff.

### 7.4 Cron Monitoring

Add dead-man's switch monitoring using a service like **Healthchecks.io**:

```bash
# Append to cron command
0 8 * * * www-data /usr/bin/php /var/www/mips-platform/tools/renewal_cron.php >> /var/log/mips/renewal.log 2>&1 && curl -fsS -m 10 --retry 5 https://hc-ping.com/YOUR-UUID > /dev/null
```

---

## 8. Webhook Handling

### 8.1 MIPS Webhook Endpoint

**URL:** `POST /webhook/mips`

**Authentication:** HMAC-SHA256 signature in `X-MIPS-Signature` header.

**Flow:**

```
1. Nginx routes POST /webhook/mips → index.php → WebhookController
2. Controller reads raw body (do NOT json_decode before verification)
3. Verify HMAC signature → 401 if invalid
4. json_decode payload
5. Log raw payload to payment_events
6. Look up payment_link by mips_transaction_ref
7. Route to handler based on event_type:
   payment.success → RenewalService::markPaid() + receipt email
   payment.failed  → mark payment_link.status = 'failed', notify agent
8. Return HTTP 200 (MIPS expects acknowledgement within 10 seconds)
```

**Important:** MIPS may retry webhooks if no `200` is received. The `payment_events` log prevents double-processing — check for existing event before acting.

```php
// Idempotency check in WebhookController
$existing = $db->fetchOne(
    'SELECT id FROM payment_events WHERE mips_reference = ? AND event_type = ?',
    [$data['transaction_ref'], $data['event_type']]
);
if ($existing) {
    http_response_code(200);
    exit; // Already processed
}
```

### 8.2 WhatsApp Webhook (Inbound)

**URL:** `POST /webhook/whatsapp` *(Sprint 5 — inbound message handling)*

Used to receive delivery receipts (`delivered`, `read` status updates) and optional inbound client replies. Verification uses the Meta webhook challenge:

```php
// GET /webhook/whatsapp — Meta verification challenge
if ($_GET['hub_mode'] === 'subscribe' && $_GET['hub_verify_token'] === $_ENV['WA_VERIFY_TOKEN']) {
    echo $_GET['hub_challenge'];
    exit;
}
```

---

## 9. Notification System

### 9.1 Message Queue Architecture

```
RenewalService / AppointmentService
        │
        ▼
  NotificationService::send()
        │
        ├── Render template (str_replace {{vars}})
        ├── INSERT INTO communications (status='queued')
        │
        ├── Attempt immediate delivery:
        │     email    → PHPMailer::send()
        │     whatsapp → Meta Graph API POST
        │
        ├── On success: UPDATE communications SET status='sent', sent_at=NOW()
        └── On failure: UPDATE communications SET status='failed', error_detail=...
                           (queue_worker.php retries up to 3×)
```

### 9.2 Adding a New Template

1. Insert into `notification_templates` via a migration or seed:

```sql
INSERT INTO notification_templates
    (template_key, channel, language, subject, body_template, variables_json, is_active)
VALUES
    ('my_new_event', 'email', 'en',
     'Subject with {{variable}}',
     'Body text with {{client_name}} and {{other_var}}.',
     '["client_name","other_var"]',
     1);
```

2. Call from PHP:

```php
$notif->send(
    templateKey:   'my_new_event',
    context:       ['client_name' => 'Raj', 'other_var' => 'value', 'language' => 'en',
                    'client_email' => 'raj@example.com', 'client_wa' => '+23057000000'],
    clientId:      42
);
```

### 9.3 Template Variables Syntax

Templates use `{{variable_name}}` placeholders (double curly braces). Variables are replaced via simple `str_replace` — no logic, loops, or conditionals in templates. For conditional content (e.g., video link only for video appointments), use pre-composed variables in the context:

```php
$context['location_or_video_line'] = $appointment['format'] === 'video'
    ? 'Video link: ' . $appointment['video_link']
    : 'Location: ' . $appointment['location'];
```

---

## 10. Security Architecture

### 10.1 Authentication

- Passwords hashed with `password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12])`.
- Login rate-limited at both application level (`RateLimiter.php`) and Nginx level.
- Session cookie: `Secure`, `HttpOnly`, `SameSite=Lax`.
- Idle timeout: 30 minutes (configurable in `config.php`).
- No "remember me" in MVP — sessions expire at browser close.

### 10.2 CSRF Protection

Every state-changing form (`POST`, `PUT`, `DELETE`) must include and validate a CSRF token:

```php
// In form template
<input type="hidden" name="csrf_token" value="<?= Csrf::token() ?>">

// In controller
Csrf::validate($_POST['csrf_token'] ?? '');
```

### 10.3 Multi-Tenancy Isolation

Every query against tenant-scoped data must include `brokerage_id`:

```php
// Always enforce brokerage scope — never rely on URL parameter alone
$client = $db->fetchOne(
    'SELECT * FROM clients WHERE id = ? AND brokerage_id = ?',
    [$clientId, $currentAgent->brokerageId]
);
if (!$client) {
    Response::json(['error' => 'Not found'], 404);
    return;
}
```

A `TenantScope` middleware (Sprint 1) should inject `brokerage_id` into every controller automatically.

### 10.4 Input Validation

All user input validated via `Validator.php` before any database write. Never trust client-supplied `brokerage_id`, `agent_id`, or `policy_id` without cross-checking against the authenticated session's brokerage.

### 10.5 MIPS Credential Storage

MIPS API keys are stored encrypted in `brokerages.mips_api_key_encrypted` using AES-256-CBC with an IV prepended:

```
stored value = base64( iv :: openssl_encrypt(plaintext, AES-256-CBC, key, 0, iv) )
```

The encryption key lives only in the environment variable `APP_ENCRYPTION_KEY`, never in the database or code.

### 10.6 Document Upload Security

- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`.
- File extension validated against MIME type (don't trust extension alone).
- Files stored outside `public/` directory — served via a controller that checks brokerage ownership before streaming.
- Filenames sanitised (strip path traversal, special characters).

```php
$safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($originalName));
$storagePath = '/var/www/mips-platform/storage/documents/' . $brokerageId . '/' . uniqid() . '_' . $safeName;
```

### 10.7 SQL Injection Prevention

All database queries use PDO prepared statements. The `Database::fetchAll()`, `fetchOne()`, and `execute()` methods only accept parameterised queries:

```php
// Correct — parameterised
$db->fetchOne('SELECT * FROM clients WHERE id = ? AND brokerage_id = ?', [$id, $brokerageId]);

// NEVER do this
$db->fetchOne("SELECT * FROM clients WHERE id = $id");  // SQL injection
```

### 10.8 XSS Prevention

All output in templates is escaped with `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')`. When Twig is integrated (Sprint 2), auto-escaping handles this automatically.

---

## 11. Routing & Controllers

### 11.1 Route Map (MVP)

| Method | Path | Controller | Auth required |
|---|---|---|---|
| GET | `/` | DashboardController | Yes |
| GET/POST | `/login` | LoginController | No |
| POST | `/logout` | LogoutController | Yes |
| GET/POST | `/register` | RegisterController | No |
| GET | `/me` | MeController | Yes |
| GET | `/clients` | ClientController@index | Yes |
| GET/POST | `/clients/create` | ClientController@create | Yes |
| GET | `/clients/{id}` | ClientController@show | Yes |
| GET/POST | `/clients/{id}/edit` | ClientController@edit | Yes |
| GET | `/policies` | PolicyController@index | Yes |
| GET/POST | `/policies/create` | PolicyController@create | Yes |
| GET | `/policies/{id}` | PolicyController@show | Yes |
| GET/POST | `/appointments` | AppointmentController | Yes |
| GET | `/payments` | PaymentController@index | Yes |
| POST | `/payments/generate` | PaymentController@generate | Yes |
| GET | `/renewals` | RenewalController@index | Yes |
| GET | `/renewals/{id}` | RenewalController@show | Yes |
| POST | `/renewals/{id}/send` | RenewalController@send | Yes |
| POST | `/webhook/mips` | WebhookController@mips | No (HMAC) |
| POST | `/webhook/whatsapp` | WebhookController@whatsapp | No (token) |

### 11.2 Controller Base Pattern

```php
abstract class BaseController
{
    public function __construct(
        protected readonly Database $db,
        protected readonly Session  $session
    ) {}

    protected function requireAuth(): array
    {
        $agent = $this->session->getAgent();
        if (!$agent) {
            Response::redirect('/login');
            exit;
        }
        return $agent; // ['id', 'brokerage_id', 'role', ...]
    }

    protected function requireRole(array $agent, string ...$roles): void
    {
        if (!in_array($agent['role'], $roles, true)) {
            Response::json(['error' => 'Forbidden'], 403);
            exit;
        }
    }
}
```

---

## 12. Multi-Tenancy Model

InsurLink MU uses **siloed multi-tenancy**: each brokerage's data is logically separated by `brokerage_id` in a shared database. There is no row-level security at the database layer — isolation is enforced at the application layer.

### 12.1 Tenancy Enforcement Checklist

Every new controller/query must satisfy:

- [ ] `brokerage_id` extracted from authenticated session, not from URL/POST body.
- [ ] All `SELECT` queries include `AND brokerage_id = ?` or join to a table that does.
- [ ] `INSERT` statements populate `brokerage_id` from session.
- [ ] `UPDATE` and `DELETE` include `WHERE ... AND brokerage_id = ?`.
- [ ] File storage paths are namespaced by `brokerage_id`.

### 12.2 Agent Role Permissions

| Action | Admin | Agent | Readonly |
|---|---|---|---|
| View all agents' clients | Yes | Own only | Yes (read) |
| Create/edit clients | Yes | Yes | No |
| Create/edit policies | Yes | Yes | No |
| Generate payment links | Yes | Yes | No |
| View all renewals | Yes | Own only | Yes |
| Manually trigger renewal send | Yes | Own only | No |
| Configure automation settings | Yes | No | No |
| View audit log | Yes | No | No |
| Manage agents | Yes | No | No |
| Configure MIPS credentials | Yes | No | No |

---

## 13. Production Deployment

### 13.1 Pre-Launch Checklist

**Application**
- [ ] `config.php`: `app.env = 'production'` (disables error display)
- [ ] `session.secure = true` (HTTPS only)
- [ ] All `.env` values populated — no placeholders
- [ ] Composer autoloader optimised: `composer dump-autoload --optimize`
- [ ] Unused tools/debug scripts removed from `public/`

**Database**
- [ ] Schema applied on production DB
- [ ] Production DB user has only `SELECT`, `INSERT`, `UPDATE`, `DELETE` — no `DROP`, `ALTER`
- [ ] Automated backups configured (daily dump to off-site storage)
- [ ] Binary log enabled for point-in-time recovery

**Security**
- [ ] HTTPS enforced, HTTP → HTTPS redirect in Nginx
- [ ] HSTS header active
- [ ] `public/.htaccess` blocks access to `src/`, `config/`, `sql/`, `tools/`
- [ ] MIPS webhook endpoint IP allowlisted to MIPS IP ranges
- [ ] CSRF tokens active on all forms
- [ ] Rate limiting active on `/login`

**Cron**
- [ ] Renewal cron scheduled and tested (`--dry-run` flag recommended for first run)
- [ ] Log directory writable by `www-data`
- [ ] Dead-man's switch monitoring configured

**Monitoring**
- [ ] Uptime monitoring on `https://app.insurlink.mu/health`
- [ ] Error alerting (Sentry or equivalent)
- [ ] Log rotation configured for `/var/log/mips/*.log`

### 13.2 Zero-Downtime Deployment

```bash
# 1. Pull new code to staging directory
git -C /var/www/mips-platform-new pull origin main

# 2. Install dependencies
composer install --no-dev --optimize-autoloader -d /var/www/mips-platform-new

# 3. Run any new migrations
mysql -u mips_user -p mips_platform < /var/www/mips-platform-new/sql/migrations/XXXX.sql

# 4. Atomic swap (symlink swap — zero downtime)
ln -sfn /var/www/mips-platform-new /var/www/mips-platform

# 5. Reload PHP-FPM (graceful — in-flight requests complete)
systemctl reload php8.2-fpm
```

---

## 14. Monitoring & Logging

### 14.1 Log Files

| Log | Path | Content |
|---|---|---|
| Renewal cron | `/var/log/mips/renewal.log` | Per-run stats, trigger events, errors |
| Appointment cron | `/var/log/mips/appointments.log` | Reminder dispatch log |
| Queue worker | `/var/log/mips/queue.log` | Message delivery attempts |
| Nginx access | `/var/log/nginx/access.log` | All HTTP requests |
| Nginx error | `/var/log/nginx/error.log` | Nginx-level errors |
| PHP-FPM | `/var/log/php8.2-fpm.log` | PHP fatal errors |
| Application | `communications` table | All notification attempts (queryable) |
| Payments | `payment_events` table | All webhook events (queryable) |
| Audit | `audit_log` table | All entity changes (FSC-required) |

### 14.2 Health Check Endpoint

Implement `GET /health` (Sprint 6) returning:

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-05-19T08:00:00+04:00",
  "renewal_cron_last_run": "2026-05-19T08:00:12+04:00",
  "queue_depth": 3
}
```

### 14.3 Key Metrics to Alert On

| Metric | Alert threshold | Severity |
|---|---|---|
| `/health` returns non-200 | Immediate | Critical |
| `renewal_cron` not run in 25+ hours | — | Critical |
| `communications.status = 'failed'` count > 10 in 1 hour | — | High |
| `payment_events` with no corresponding `payment_links` match | Any | High |
| DB connection pool exhausted | — | Critical |
| Disk usage > 80% | — | Medium |

---

## 15. Troubleshooting

### 15.1 Renewal Cron Not Firing

1. Check systemd timer: `systemctl status mips-renewal.timer`
2. Check log: `tail -100 /var/log/mips/renewal.log`
3. Verify PHP can connect to DB: `php -r "new PDO('mysql:host=127.0.0.1;dbname=mips_platform', 'mips_user', 'PASSWORD');"`
4. Run manually and watch output: `sudo -u www-data php /var/www/mips-platform/tools/renewal_cron.php`

### 15.2 MIPS Payment Link Not Generated

1. Check `brokerages.mips_merchant_id` is populated.
2. Test decryption: `MipsService::resolveCredentials($brokerageId)` — throws if key is corrupt.
3. Check MIPS API is reachable from server: `curl -I https://api.mips.mu/v1`
4. Review `payment_links` table for failed rows.

### 15.3 WhatsApp Messages Not Delivered

1. Verify `WA_ACCESS_TOKEN` is not expired (Meta tokens expire; use permanent token or refresh).
2. Check `WA_PHONE_NUMBER_ID` matches the registered business number.
3. Review `communications` table: `SELECT status, error_detail FROM communications WHERE channel = 'whatsapp' ORDER BY created_at DESC LIMIT 20`.
4. Verify client's WhatsApp number is in E.164 format (`+23057xxxxxx`).
5. Check Meta API quota: 1,000 free conversations/month for new Business accounts.

### 15.4 MIPS Webhook Not Received

1. Confirm webhook URL is publicly accessible: `curl -X POST https://app.insurlink.mu/webhook/mips`
2. Check MIPS merchant portal — webhook URL configured correctly.
3. Review Nginx error log for 4xx/5xx on `/webhook/mips`.
4. Verify HMAC validation is using the correct API key (same brokerage as the payment link).

### 15.5 Session Issues (Unexpected Logouts)

1. Check `session.idle_timeout` in `config.php` — default 30 min.
2. Verify session files are writable: `ls -la /var/lib/php/sessions/`
3. Check Nginx `client_max_body_size` — large form submissions may fail silently.

---

## 16. Development Guide

### 16.1 Adding a New Controller

```bash
# 1. Create controller file
touch src/Controllers/MyController.php

# 2. Extend BaseController, add requireAuth() at top of each method
# 3. Register route in public/index.php router
# 4. Create template in templates/
# 5. Write feature test
```

### 16.2 Adding a Database Migration

Create a numbered SQL file:

```bash
touch sql/migrations/0002_add_claims_table.sql
```

Convention: `NNNN_description.sql`. Apply manually or via a future migration runner.

### 16.3 Running Tests

```bash
# PHP unit tests (PHPUnit — add to composer.json dev dependencies)
./vendor/bin/phpunit tests/

# Database integration tests (requires test DB)
DB_NAME=mips_platform_test ./vendor/bin/phpunit tests/Integration/
```

### 16.4 Code Style

- PSR-12 coding standard.
- Strict types (`declare(strict_types=1)`) in every PHP file.
- No raw SQL outside of service/repository classes.
- All `$_GET`, `$_POST`, `$_FILES` input must pass through `Validator.php` before use.

### 16.5 Feature Flags

For Phase 2 features (AI quotes, instalment payments), use a simple DB-backed flag:

```sql
ALTER TABLE brokerages ADD COLUMN features_json JSON NULL COMMENT 'Feature flags per brokerage';
-- Example: {"ai_quotes": true, "instalments": false}
```

```php
$features = json_decode($brokerage['features_json'] ?? '{}', true);
if ($features['ai_quotes'] ?? false) {
    // Show AI quote module
}
```
