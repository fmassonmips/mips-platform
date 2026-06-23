# Deploying to inflow.maucrm.com (ICDSoft shared hosting)

Target: Apache + PHP 8 + MySQL 8 on ICDSoft shared hosting.
Database: `maucrm_inflow` (user `inflow`) on `127.0.0.1:3308` (local to the server).

## 1. Requirements

PHP 8 with the `pdo_mysql` and `curl` extensions (both standard on ICDSoft).
No Composer step is needed — the app uses a built-in autoloader.

## 2. Document root (preferred setup)

Point the subdomain's document root at the project's **`public/`** directory so
that `src/`, `config/` and `sql/` sit *outside* the web root.

In the ICDSoft Control Panel:
1. **Domains → inflow.maucrm.com → Document Root** (or create the subdomain).
2. Set it to the `public` folder of where you upload the project,
   e.g. `/home/<account>/www/inflow/public`.

Fallback if you cannot change the document root: upload the project so the repo
root *is* the document root. The root `.htaccess` rewrites all requests into
`public/`, and `config/.htaccess` + `src/.htaccess` deny direct access to the
non-public folders.

## 3. Upload the files

Upload the whole project (everything except `.git/`). Options:
- **SSH/rsync** (fastest):
  `rsync -az --exclude '.git' ./ <user>@<host>:/home/<account>/www/inflow/`
- **ICDSoft File Manager**: upload a zip of the project and extract it.
- **Git**: clone the branch via the Control Panel's Git tool.

Then upload **`config/config.local.php`** (it is git-ignored, so it is not in
the repo). It already contains the DB credentials; add the live Inflow key:

```php
'inflow' => [ 'api_key' => 'inflow_prod_...' ],
```

Without the key, the payment endpoints return HTTP 503 but the rest of the app
works.

## 4. Create the database schema

The MySQL server is local to the host, so import from the server (not remotely):

- **phpMyAdmin** (Control Panel → MySQL Databases → phpMyAdmin): select the
  `maucrm_inflow` database and import `sql/schema.sql`, then `sql/seed.sql`.
  - The scripts start with `CREATE DATABASE` / `USE mips_platform`. Since the
    database is already named `maucrm_inflow`, either remove those two lines
    before importing, or run the table statements against `maucrm_inflow`
    directly. The `CREATE TABLE IF NOT EXISTS` / `INSERT` statements are what
    matter.
- **SSH**: `mysql -h 127.0.0.1 -P 3308 -u inflow -p maucrm_inflow < sql/schema.sql`
  then the same for `sql/seed.sql`.

`seed.sql` creates an admin login `admin@example.com` / `Admin123!` — **change
this password immediately after first login** (or remove the seed user once you
create a real account).

## 5. Verify

1. Visit `https://inflow.maucrm.com/login.php` and log in with the seed admin.
2. `https://inflow.maucrm.com/dashboard.php` should load.
3. Confirm `https://inflow.maucrm.com/config/config.php` returns **403/empty**
   (not the file contents) — proves the non-public folders are protected.
4. Once the Inflow key is set, `POST /api/payments` works (auth + CSRF required).

## 6. Notes

- HTTPS is already in use; cookies are `secure` + `httponly` in config.
- If MySQL connects via a unix socket instead of TCP on your plan, switch
  `db.host` to `localhost` and remove the `port` override in
  `config/config.local.php`.
- `config/config.local.php` holds all secrets and is never committed.
