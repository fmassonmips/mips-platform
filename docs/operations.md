# Operations

Deploy, run, observe, and recover. This is the on-call runbook.

## 1. Topology recap

```
   Cloudflare (TLS, WAF, rate-limit)
        │
        ▼
   Nginx (LB, TLS terminator)
   ├── app-1  (PHP-FPM)
   └── app-2  (PHP-FPM)
        │
        ├── MariaDB primary    (writes)
        ├── MariaDB replica    (reports)
        └── Redis              (sessions, queue, rate-limits)
        │
        └── workers (supervisord)
            ├── notifications
            ├── reconciliation
            ├── seat-hold-reaper
            └── expiry-warner
```

## 2. Environments

| Env | Purpose | URL | Branch |
|---|---|---|---|
| `local` | dev | localhost | feature branches |
| `staging` | pre-prod | `staging.mips.studio` | `main` |
| `production` | live | `app.mips.studio` | `release/*` tags |

Each env has its own MIPS merchant (sandbox for local + staging, production for live).

## 3. Deploy

### 3.1 Backend (PHP)

```bash
# from CI, on staging or production runner
git fetch --tags
git checkout v1.x.y                        # release tag
composer install --no-dev --optimize-autoloader
php artisan migrate --force                # once Laravel lands
php artisan config:cache
php artisan route:cache
sudo systemctl reload php-fpm
sudo systemctl reload nginx
```

Rolling: drain app-1 (deregister from Nginx upstream), deploy, warm `/health`, re-register; repeat for app-2.

### 3.2 Frontend (PWA)

```bash
cd web/
npm ci
npm run build
rsync -a dist/ deploy@host:/var/www/pwa/
```

Frontend deploys are independent from backend — bumping a CDN cache key forces clients to refresh.

### 3.3 Workers

```bash
sudo supervisorctl restart mips-workers:*
```

Workers must be restarted after any code change; they hold compiled config.

## 4. Health checks

| Endpoint | What it checks |
|---|---|
| `GET /health` | App boots, DB reachable |
| `GET /health/deep` | DB + Redis + MIPS sandbox `getPaymentStatus(dummy)` |

Nginx upstream uses `/health`. External monitor (Better Stack / UptimeRobot) hits `/health/deep` every 60s.

## 5. Environment variables

`/etc/mips-platform/.env` (mode 0600, owner `www-data`).

```
APP_ENV=production
APP_KEY=base64:...
APP_URL=https://app.mips.studio
APP_TZ=Indian/Mauritius

DB_HOST=10.0.0.10
DB_NAME=mips_platform
DB_USER=mips_app
DB_PASS=...

REDIS_HOST=10.0.0.11
REDIS_PORT=6379
REDIS_PASS=...

MIPS_BASE_URL=https://api.mips.mu
MIPS_WEBHOOK_SECRET=...
JWT_SIGNING_KEY=...

SMS_PROVIDER=local
SMS_API_KEY=...
SMS_FALLBACK_PROVIDER=twilio
TWILIO_SID=...
TWILIO_TOKEN=...

EMAIL_PROVIDER=postmark
POSTMARK_TOKEN=...
EMAIL_FROM=noreply@mips.studio

SENTRY_DSN=...
LOG_CHANNEL=stdout
```

## 6. Backups

| What | When | Where | Retention |
|---|---|---|---|
| Full DB dump (`mysqldump`) | nightly 02:00 SGT | encrypted S3-compatible bucket | 30 days |
| Binary logs | continuous | same bucket | 7 days (point-in-time recovery) |
| App config (`/etc/mips-platform/`) | nightly | bucket | 30 days |
| Redis | RDB snapshot daily (advisory only) | bucket | 7 days |

Encryption key in KMS, separate from application secrets.

### 6.1 Restore drill (quarterly)

```bash
# On a fresh VM
aws s3 cp s3://mips-backups/db/2026-05-19.sql.gz.enc .
gpg --decrypt 2026-05-19.sql.gz.enc | gunzip | mysql -u root mips_restore
# Run smoke tests against the restored DB; document elapsed time.
```

Target restore time: < 1 hour for the pilot's data volume.

## 7. Logs

```
/var/log/mips-platform/app.log         JSON, stdout from PHP-FPM
/var/log/mips-platform/workers.log     JSON, stdout from workers
/var/log/nginx/access.log              Combined format
/var/log/nginx/error.log
```

Shipped to Loki / Logtail via Promtail. Retention: 90 days.

Useful queries:

- All failed bookings in the last hour:
  `{app="mips-platform"} |= "booking" |= "FAILED"`
- Webhook 5xx in the last 24h:
  `{route="/api/v1/webhooks/mips"} | json | status >= 500`

## 8. Metrics & dashboards

Prometheus scrape `/metrics`. Grafana dashboards:

1. **RED — booking pipeline**
   - Rate / Errors / Duration of `POST /bookings`, `POST /payments/intent`, webhook
2. **Money plane**
   - payments by method (Juice vs Card), success/refund/decline rates
   - reconciliation drift (must be 0)
3. **Retention loop**
   - low-balance queued → sent → delivered
   - 7-day renewal conversion from low-balance event
4. **Infra**
   - DB CPU, replication lag, Redis ops/sec, queue depth

## 9. Alerts

| Alert | Threshold | Action |
|---|---|---|
| App 5xx rate | > 1% / 5m | page on-call |
| `payment_to_confirmation_seconds_p95` | > 30s / 5m | page |
| Webhook 5xx | > 1% / 5m | page |
| Reconciliation drift | > 0 | page **and** hard-stop payment plane |
| SMS delivery rate | < 90% / 1h | page |
| Disk free | < 15% | page |
| Replication lag | > 60s | warn |
| Queue depth (notifications) | > 1000 | warn |

## 10. Runbooks

### 10.1 MIPS appears down

Symptoms: 5xx on `createPayment`, missing webhooks, customer-side payment redirects time out.

1. Check MIPS status (call/contact + their status page).
2. Switch booking to "pay at studio" mode:
   ```sql
   UPDATE studio
   SET settings_json = JSON_SET(settings_json, '$.payment_kill_switch', true)
   WHERE id = :studio_id;
   ```
3. Banner on customer pages: *"Paiement en magasin uniquement pour quelques minutes"*.
4. When MIPS is healthy, unset the kill switch.
5. Reconciliation worker will sweep any stranded payments.

### 10.2 Suspected overbooking

1. Stop accepting new bookings for the affected class:
   ```sql
   UPDATE class_instance SET status = 'CANCELLED' WHERE id = ?;   -- soft hold
   ```
2. Inspect:
   ```sql
   SELECT id, status, hold_expires_at FROM booking WHERE class_instance_id = ? ORDER BY created_at;
   ```
3. If two `CONFIRMED` exist beyond capacity: pick the latest, refund it, message the customer. Document in audit log with a free-text reason.
4. Open an incident and find the missing lock — the test in `booking-engine.md` §8 should be expanded to reproduce.

### 10.3 Reconciliation drift

The nightly reconcile produced a non-zero diff.

1. Page fires immediately.
2. Hard-stop the payment plane (kill switch).
3. Compare DB `payment` rows vs MIPS settlement file row by row.
4. Three branches:
   - **MIPS has it, we don't**: investigate possible missed webhook. Insert payment row manually if all checks pass.
   - **We have it, MIPS doesn't**: investigate double-confirmation in our code. Revert the booking confirmation, re-credit, notify customer.
   - **Amount mismatch**: open ticket with MIPS, do not auto-correct.
5. Resume payment plane only when diff = 0 and root cause is identified.

### 10.4 SMS provider down

1. Confirm via `SELECT status FROM notification ORDER BY id DESC LIMIT 20;` — many `FAILED`.
2. Swap provider in env:
   ```bash
   sed -i 's/SMS_PROVIDER=local/SMS_PROVIDER=twilio/' /etc/mips-platform/.env
   sudo supervisorctl restart mips-workers:notifications
   ```
3. Backfill stuck rows: `UPDATE notification SET status='QUEUED', attempts=0 WHERE status='FAILED' AND created_at > NOW() - INTERVAL 2 HOUR;`
4. Restore primary when healthy.

### 10.5 DB primary down

1. Confirm with `mysql -h primary -e 'SELECT 1'`.
2. Promote the replica:
   ```sql
   STOP SLAVE; RESET SLAVE ALL;
   ```
3. Repoint app: edit `/etc/mips-platform/.env` `DB_HOST` to replica IP. Reload PHP-FPM.
4. Open an incident; recovering the primary is post-mortem work.
5. Backups: ensure binlogs were shipped through the cutover.

### 10.6 Lost JWT secret / breach suspected

1. Rotate `JWT_SIGNING_KEY`.
2. All existing customer JWTs invalidate; the next request to a protected route returns 401, and the PWA re-prompts auth.
3. Communicate the "you may need to log in again" message in the next status update.

## 11. On-call expectations

- Pilot phase: one engineer on call 24/7, response SLA 30 min.
- Studio class hours (Mauritius): 06:00–22:00 — peak coverage.
- Post-pilot: rotate weekly between engineers.

## 12. Cost levers

For the pilot:
- 2× small app VPS (~$15/mo each)
- 1× small DB VPS (~$25/mo) + 1 replica (~$15/mo)
- 1× small Redis VPS (~$10/mo)
- MIPS fees per transaction (pass-through; surfaced on revenue dashboard as `fee_minor`)
- SMS: ~MUR 0.50 per message; budget 1 message per booking + 1 retention/week → ≈ MUR 200/month/100 active customers
- Email: Postmark free tier covers MVP volumes

Budget alert: monthly infra > MUR 5,000 triggers review.
