# Getting Started

A local dev environment for the MIPS Booking & Payment Engine. Targets: any Linux/macOS machine with PHP 8.2+ and MariaDB 10.6+.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| PHP | 8.2+ | Application runtime |
| MariaDB / MySQL | 10.6+ / 8.0+ | OLTP database |
| Composer | 2.x | Dependency manager (when Laravel is added in Sprint 1) |
| Redis | 7.x | Sessions, rate limiting, seat-hold TTLs, queue |
| Node.js | 20.x | PWA frontend (added in Sprint 2) |
| Git | any | VCS |

Check your versions:

```bash
php -v
mysql --version
composer --version
redis-cli --version
node --version
```

## 2. Clone

```bash
git clone https://github.com/fmassonmips/mips-platform.git
cd mips-platform
```

## 3. Database

Bootstrap the database. The current `sql/schema.sql` covers the auth scaffold; Sprint 1 adds the booking tables (see `docs/database.md`).

```bash
mysql -u root -p < sql/schema.sql
mysql -u root -p < sql/seed.sql   # creates a dev admin user
```

By default this creates a database `mips_platform`. Override with:

```bash
MIPS_DB_NAME=mips_dev mysql -u root -p < sql/schema.sql
```

## 4. Configuration

Copy and edit the example config:

```bash
cp config/config.example.php config/config.local.php
```

Minimum env vars (will move to `.env` once Laravel lands):

```php
return [
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'mips_platform',
        'user' => 'mips_user',
        'pass' => 'change_me',
    ],
    'mips' => [
        'merchant_id'   => 'SANDBOX-001',
        'api_key'       => 'sandbox_key',
        'webhook_secret'=> 'sandbox_webhook_secret',
        'base_url'      => 'https://sandbox.mips.mu',
    ],
    'sms' => [
        'provider'  => 'mock',     // mock | local | twilio
        'api_key'   => '',
    ],
    'email' => [
        'provider'  => 'mock',     // mock | postmark | ses
        'api_key'   => '',
        'from'      => 'noreply@example.test',
    ],
    'app' => [
        'env'       => 'local',
        'base_url'  => 'http://localhost:8080',
        'tz'        => 'Indian/Mauritius',
    ],
];
```

## 5. Run the dev server

PHP built-in server is fine for local work — `public/` is the web root.

```bash
php -S 127.0.0.1:8080 -t public
```

Visit `http://127.0.0.1:8080`. You should see the existing login page.

## 6. Test the auth flow

```bash
# Create an admin via the CLI tool
php tools/make_password_hash.php "MyDevPassword123!"
# Then INSERT into users with role='owner' using the returned hash.
```

Log in at `http://127.0.0.1:8080/login.php`. You should land on the dashboard.

## 7. Run the test suite

```bash
composer install                  # once dependencies are added
vendor/bin/phpunit                # unit + integration tests
```

## 8. Run the queue / outbox worker (Sprint 4+)

```bash
php bin/worker notifications      # processes notification outbox
php bin/worker reconciliation     # nightly MIPS settlement reconcile
```

## 9. Mock MIPS for local development

Until the studio is wired to MIPS sandbox, use the **mock gateway** by setting `mips.base_url` to `http://127.0.0.1:8081` and running:

```bash
php bin/mock-mips
```

This returns deterministic responses for testing webhook idempotency and reconciliation.

## 10. Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `SQLSTATE[HY000] [2002] Connection refused` | MariaDB not running | `brew services start mariadb` or `systemctl start mariadb` |
| `Class "Redis" not found` | PHP redis extension missing | `pecl install redis` then enable in `php.ini` |
| `Webhook signature invalid` locally | `webhook_secret` mismatch with mock | Re-copy from `bin/mock-mips` startup banner |
| Login loops back | `Secure` cookie on HTTP | Set `app.env=local` to relax `Secure` flag |

## Next steps

- Read [`architecture.md`](./architecture.md) for the runtime topology.
- Read [`booking-engine.md`](./booking-engine.md) before touching the seat-hold or ledger code.
- Read [`contributing.md`](./contributing.md) for branch and PR conventions.
