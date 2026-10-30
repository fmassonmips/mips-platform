#!/usr/bin/env bash
# End-to-end tests: real browser (Playwright/Chromium), PHP built-in server,
# MariaDB, fake SMTP, fake MRA API and a fake Airbnb calendar, all local.
#
#   tests/e2e/run.sh              every suite
#   tests/e2e/run.sh e2e22 e2e25  some suites
#
# Needs: PHP 8.3 (pdo_mysql, mbstring, curl, sodium, zip), MariaDB running and
# reachable with the `mysql` command as an administrator (socket or
# ~/.my.cnf), Node + Playwright with Chromium, Python 3 with `cryptography`,
# rsync, openssl. Free ports: 8099 (app), 8098 (MRA), 8097 (calendar), 2525 (SMTP).
#
# Uses its own database (MIPS_E2E_DB, default mips_e2e), dropped and
# recreated before each suite: never point it at a real database.
# Work files (copy of the code, e-mails, screenshots): tests/.work/.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
E2E="$ROOT/tests/e2e"
W="${MIPS_E2E_WORKDIR:-$ROOT/tests/.work}"
DB="${MIPS_E2E_DB:-mips_e2e}"
DB_USER="${MIPS_E2E_DB_USER:-mips_e2e}"
DB_PASS="${MIPS_E2E_DB_PASS:-mips_e2e_pass}"
export MIPS_E2E_DB="$DB"

case "$DB" in mips_platform|*prod*) echo "Refusing to use database '$DB' (it is dropped before each suite)." >&2; exit 2;; esac
mkdir -p "$W/mail" "$W/fakemra/received" "$W/ical"

# Copy of the code with a test configuration (config.local.php overrides config.php).
rsync -a --delete --exclude .git --exclude tests/.work --exclude config/config.local.php "$ROOT/" "$W/t/"
cat > "$W/t/config/config.local.php" <<PHP
<?php
return [
    'app'        => ['env' => 'demo', 'url' => 'http://127.0.0.1:8099', 'secret_key' => '$(openssl rand -base64 32)'],
    'db'         => ['host' => '127.0.0.1', 'port' => 3306, 'name' => '$DB', 'user' => '$DB_USER', 'pass' => '$DB_PASS'],
    'session'    => ['secure' => false],
    'mail'       => ['host' => '127.0.0.1', 'port' => 2525, 'encryption' => 'none', 'username' => '', 'password' => '', 'from_address' => 'no-reply@mips.mu'],
    'mra'        => ['auth_url' => 'http://127.0.0.1:8098/einvoice-token-service/token-api/generate-token',
                     'transmit_url' => 'http://127.0.0.1:8098/realtime/invoice/transmit-simulation',
                     'public_key_file' => '$W/fakemra/mra_public_key.pem'],
    'bookora'    => ['ical_allow_private' => true, 'ical_timeout' => 5],
    'backoffice' => ['staff' => ['Staff@MIPS.mu']],
    'billing'    => ['contact_email' => 'abonnement@mips.mu'],
];
PHP

mysql -e "SET GLOBAL time_zone = '+04:00';" || exit 2   # tests insert dates with the mysql command: same clock as the app
mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
          CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
          GRANT ALL ON \`$DB\`.* TO '$DB_USER'@'127.0.0.1'; GRANT ALL ON \`$DB\`.* TO '$DB_USER'@'localhost';" || exit 2

# Services (started once; up.sh restarts any that stopped, e2e24 uses it after cutting the SMTP).
cat > "$W/up.sh" <<SH
#!/usr/bin/env bash
up() { (echo > /dev/tcp/127.0.0.1/\$1) 2>/dev/null; }
# Only the server itself goes to the background, with no inherited output, so callers
# (run.sh, e2e24 via execFileSync) are not left waiting on an open pipe.
up 2525 || { nohup python3 "$E2E/support/fake_smtp.py" "$W/mail" </dev/null >/dev/null 2>&1 & }
up 8098 || { nohup python3 "$E2E/support/fakemra/server.py" "$W/fakemra" </dev/null >/dev/null 2>&1 & }
up 8097 || { (cd "$W/ical" && exec nohup python3 -m http.server 8097) </dev/null >/dev/null 2>&1 & }
up 8099 || { (cd "$W/t" && exec nohup php -S 127.0.0.1:8099 -t public "$E2E/support/router.php") </dev/null >/dev/null 2>&1 & }
for i in \$(seq 40); do up 2525 && up 8098 && up 8097 && up 8099 && break; sleep 0.25; done
SH
chmod +x "$W/up.sh"
"$W/up.sh"

reset() {
    mysql -e "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" &&
    sed "1,12{/^CREATE DATABASE/,/;/d;/^USE /d}" "$W/t/sql/schema.sql" | mysql "$DB" &&
    sed "/^USE /d" "$W/t/sql/seed.sql" | mysql "$DB" &&
    find "$W/mail" -type f -delete
}

suites=("$@")
if [ ${#suites[@]} -eq 0 ]; then
    suites=($(ls "$E2E" | grep -E '^e2e[0-9]*\.js$' | sed 's/\.js$//' | sort -V))
fi
pass=0; fail=0; failed=()
for t in "${suites[@]}"; do
    "$W/up.sh"; reset || { echo "Database reset failed." >&2; exit 2; }
    out=$(cd "$E2E" && timeout 600 node "$t.js" "$W" 2>&1); code=$?
    if [ $code -eq 0 ] && echo "$out" | tail -3 | grep -qE 'ALL GREEN|console errors: none|errors: none'; then
        echo "PASS $t"; pass=$((pass + 1))
    else
        echo "FAIL $t"; echo "$out" | grep -v '^✓' | head -15 | sed 's/^/    /'; fail=$((fail + 1)); failed+=("$t")
    fi
done
echo
echo "$pass passed, $fail failed${failed[*]:+ (${failed[*]})}. Screenshots and e-mails: $W"
[ $fail -eq 0 ]
