# Security

Threat model, auth, session, PCI scope, and OWASP baseline for the MIPS Booking & Payment Engine.

## 1. Threat model (STRIDE-lite)

| Threat | Asset | Mitigation |
|---|---|---|
| Spoofing | Customer phone / email | OTP for SMS, magic link signed token for email, rate-limited |
| Tampering | Webhook payload | HMAC-SHA256 over raw body, constant-time compare |
| Repudiation | Refund / manual credit | `audit_log` row in the same transaction |
| Info disclosure | PII (phone, name), payment metadata | TLS, app-layer authz, no PAN ever, scrubbed logs |
| DoS | Booking endpoint at peak | Rate limits, queue backpressure, Cloudflare/CDN in front |
| Elevation | Customer → admin | Distinct identity tables (`customer` vs `users`), explicit role check in `Auth` middleware |

## 2. Authentication

### 2.1 Customers — passwordless
- Primary: **OTP via SMS** to `customer.phone_e164`. 6-digit code, 5-minute TTL, single-use.
- Secondary: **magic link** to `customer.email`. Signed token, 15-minute TTL, single-use.
- On verify, issue a JWT (24h) stored in `HttpOnly; Secure; SameSite=Lax` cookie. The JWT carries `customer_uuid`, `studio_id`, `iat`, `exp`. Signed with HS256 using a key in `config/config.php`.
- Rate limits: 5 OTP requests per phone per hour, 20 per IP per hour. Magic link: 5 per email per hour.
- OTP storage: hashed (sha256) with a per-issue salt; never the raw code.

### 2.2 Staff — passwords
- Existing `users` table with bcrypt/argon2id hashes (`password_hash` column).
- Session via `src/Session.php` (existing) — server-side session storage in Redis (sprint 1+) or DB.
- Login attempts: tracked in `login_attempts`; 10 failures in 15 min locks the IP+email pair for 30 min.
- Session lifetime: 12 hours, sliding refresh on activity.
- Cookie flags: `HttpOnly; Secure; SameSite=Lax`. `__Host-` prefix in production.

### 2.3 Session rotation
- Rotate the session ID on login, role change, and password change.

## 3. Authorization

Role-based, enforced per route.

| Role | Can |
|---|---|
| `customer` | own bookings, own packages, own profile, own payments |
| `frontdesk` | view today's classes, check-in customers |
| `instructor` | own classes (read), check-in customers for own classes |
| `owner` | full studio admin |
| `admin` | cross-studio admin (platform staff) |

Tenant boundary: every admin query is scoped by `studio_id` from the session. The middleware injects `studio_id` as a query constraint; controllers never accept `studio_id` from the request body.

## 4. CSRF

- Every state-changing request from the same-site browser must include `X-CSRF-Token` matching the session token.
- Existing `src/Csrf.php` provides token issuance and validation.
- Webhooks are exempt (different origin, HMAC-authenticated).
- API calls from the PWA use a `SameSite=Lax` cookie + a CSRF double-submit token.

## 5. Input validation

- Server-side schema validation on every endpoint via `src/Validator.php`.
- Phone: validated as E.164 (length 8–15, leading `+`).
- Email: RFC 5322 with extra restrictions (max 254, no whitespace).
- Money fields: integer ≥ 0, ≤ 10⁹.
- Free text (notes, names): max length + HTML-escape on render.

Common rejections:
- Any string containing null bytes.
- Any UTF-8 surrogate halves.
- Any int outside declared range.

## 6. Output encoding

- HTML: contextual escaping in templates (default `htmlspecialchars(..., ENT_QUOTES | ENT_HTML5, 'UTF-8')`).
- JSON: `json_encode($v, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)`.
- SQL: prepared statements only. No `mysqli_query("... $v ...")`. Ever.

## 7. SQL injection

Zero raw concatenation policy. The codebase uses parameterized queries through `src/Database.php`. PRs that introduce string-concatenated SQL are blocked at review.

## 8. XSS

- Templates auto-escape.
- The customer-controlled fields displayed in admin (name, notes) are escaped on render.
- The PWA renders via React (auto-escapes). No `dangerouslySetInnerHTML` outside the templates we own.

## 9. Open redirect

`return_url` and `redirect_url` are constructed server-side; user-provided URLs are not honored. Magic-link tokens carry the target route name, not a free-form URL.

## 10. Rate limiting

`src/RateLimiter.php` (existing) backed by Redis.

| Endpoint | Limit |
|---|---|
| `POST /auth/otp/request` | 5/h/phone, 20/h/IP |
| `POST /auth/magic/request` | 5/h/email, 20/h/IP |
| `POST /bookings` | 60/min/customer |
| `POST /payments/one-tap-renew` | 10/min/customer |
| Admin endpoints | 600/min/user |
| Webhook endpoints | 1000/min/IP (MIPS spread) |

## 11. PCI DSS scope

- **SAQ A** (we hope to qualify): no PAN, no CVV, no track data ever stored, processed, or transmitted through our systems.
- MIPS hosted page captures the card. We receive an opaque `mips_payment_id` and (with consent) a `mips_token`.
- `raw_payload` JSON is scrubbed before persistence: anything matching a 13–19 digit run is replaced with `[REDACTED]`. This is a belt-and-braces measure; MIPS responses are designed to omit PAN.
- Annual SAQ A self-assessment + quarterly ASV scans on the public-facing perimeter.

## 12. Data protection

- TLS 1.2+ everywhere (1.3 preferred).
- Internal traffic on private network, mTLS optional in Phase 2.
- DB encryption at rest (MariaDB TDE or filesystem-level LUKS).
- Backups encrypted with a separate KMS key.
- Secrets in environment variables, never in repo. `.env.example` ships, `.env` is gitignored.

## 13. Logging

- Structured JSON logs to stdout.
- Never log: passwords, OTPs, JWTs, raw webhook bodies (the signed body is hashed in the log), full email subject lines containing PII.
- Always log: `request_id`, `actor_type`, `actor_id`, `studio_id`, `route`, HTTP status, latency.
- Logs shipped to Loki / Logtail with 90-day retention, 1-year for `audit_log` rows (which live in DB).

## 14. Auditing

Every state-changing admin action writes an `audit_log` row in the same transaction as the change. Mandatory actions:

- `booking.refund`
- `credit.manual_adjust`
- `class.cancel`
- `customer.merge` (Phase 2)
- `settings.update`
- `user.role_change`

The audit log is append-only. There is no UI to delete rows.

## 15. Backup & restore

- Nightly full DB snapshot, hourly binlog ship.
- Retention: 30 days. Encrypted with a KMS key separate from production.
- Quarterly restore drill: spin up a staging DB from the latest snapshot, run a smoke test, document the elapsed time.

## 16. Incident response

`docs/operations.md` carries the runbook. The short version:

1. **Containment**: if payment plane is suspect, hard-stop new payments via the kill-switch in `studio.settings_json`.
2. **Communication**: status page + studio owner notification within 30 min of detection.
3. **Forensics**: preserve `payment.raw_payload`, `audit_log`, `notification` rows.
4. **Notify customers** within 72h if PII is exposed (GDPR-style obligation we self-impose).

## 17. Dependency hygiene

- Composer + npm audit on every CI run.
- Patch releases applied weekly.
- Major upgrades behind a feature branch, soak-tested for at least 48h on staging.

## 18. Secrets management

| Secret | Storage |
|---|---|
| DB password | `.env`, never in repo |
| MIPS API key | `.env`; rotation procedure documented in `operations.md` |
| MIPS webhook secret | `.env`; rotation requires coordinated change with MIPS |
| JWT signing key | `.env`; rotation supports `kid` for overlap |
| SMS / Email provider keys | `.env` |

Rotation cadence: every 90 days for human-set secrets; on demand for any compromise.

## 19. Known accepted risks

- **Single-region**: pilot studio tolerates ≤ 4h downtime in DR scenario. Multi-region Phase 3.
- **No 2FA for staff**: out of scope for pilot. Will revisit before multi-studio expansion.
- **No bot protection on calendar GET**: low-value endpoint, simple Cloudflare rate limit suffices.

Document and re-review quarterly.
