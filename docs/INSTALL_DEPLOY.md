# Installation & Deployment Guide

## Prerequisites

- PHP **8.1+** (developed/tested on 8.2–8.4) with `pdo_mysql`
- MariaDB 10.4+ / MySQL 8+
- Apache with `mod_rewrite` and `mod_headers` (or Docker)

## Option A — Docker (recommended for local sandbox)

```bash
cp .env.example .env          # adjust if needed
docker compose up --build
```

- App: <http://localhost:8080>
- DB schema + seed are applied automatically on first run (via
  `/docker-entrypoint-initdb.d`).
- Demo login: `admin@example.com` / `Admin123!`
  (plus the role accounts in `sql/passpass_seed.sql`, password `Passpass123!`).

To reset the database: `docker compose down -v && docker compose up --build`.

## Option B — Local PHP + MariaDB

```bash
# 1. Create DB + base auth tables
mysql -u root -p < sql/schema.sql
mysql -u root -p < sql/seed.sql

# 2. PassPass platform schema + seed
mysql -u root -p < sql/passpass_schema.sql
mysql -u root -p < sql/passpass_seed.sql

# 3. Configure (env vars preferred; or edit config/config.php defaults)
export DB_USER=mips_user DB_PASS='...' APP_ENV=development

# 4. Serve the PUBLIC directory only
php -S localhost:8080 -t public
```

> The built-in PHP server ignores `.htaccess`. For Apache, point DocumentRoot at
> `/public`; the root `.htaccess` is only a fallback for shared hosting.

## Option C — Apache shared hosting (cPanel etc.)

1. Upload the repository outside or inside `public_html`.
2. **Preferred:** set the domain's DocumentRoot to the project's `/public`.
3. **Fallback:** if you cannot change DocumentRoot, the root `.htaccess` rewrites
   all requests into `/public` and denies access to `.sql`, `.md`, dotfiles, etc.
4. Create the MariaDB database and import the four SQL files (cPanel ▸ phpMyAdmin,
   in the order above).
5. Set DB credentials and regulatory env vars via the hosting panel, or copy
   `config/config.php` to a `config.local.php` with real values (gitignored).

## Production hardening checklist

- `APP_ENV=production` (error display off; errors logged only).
- Strong, unique `DB_PASS`; dedicated DB user with least privilege (see the
  commented `GRANT` in `sql/schema.sql`).
- HTTPS enforced (HSTS is emitted automatically over HTTPS in `bootstrap.php`).
- Real secrets in ENV / secret manager — never in the repo.
- Provider `*_MODE=live` and `*_WEBHOOK_SECRET` set; sandbox disabled.
- Remove demo seed users; provision real RBAC accounts.
- Database backups + a tested restore procedure.
- Review `docs/COMPLIANCE.md` §6 before any live operation.

## Smoke test (no DB required)

```bash
php -r '$GLOBALS["config"]=require "config/config.php";
spl_autoload_register(fn($c)=>is_file($f="src/".str_replace("\\","/",substr($c,4)).".php")&&require $f);
print_r(App\Routing\PaymentRouter::fromGlobalConfig()->table());'
```

Expected: a routing table mapping each payment type to its provider.
