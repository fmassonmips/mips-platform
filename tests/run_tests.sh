#!/usr/bin/env bash
# End-to-end tests of the merchant portal and the staff onboarding flow.
#
# Builds a throw-away instance: a copy of the code in a temporary folder,
# its own database (dropped and recreated), test staff accounts, a local SMTP
# sink and PHP's built-in server. Nothing outside these is touched.
#
#   tests/run_tests.sh
#
# Environment (defaults in brackets):
#   MYSQL      mysql client command with admin rights   [mysql]
#   DB_NAME    test database, DROPPED at each run       [mips_test]
#   PORT       web server port                          [8099]
#   SMTP_PORT  SMTP sink port                           [2525]
#   KEEP=1     keep the temporary folder and servers for inspection
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
MYSQL=${MYSQL:-mysql}
DB_NAME=${DB_NAME:-mips_test}
PORT=${PORT:-8099}
SMTP_PORT=${SMTP_PORT:-2525}
WORK=$(mktemp -d)
APP_DIR=$WORK/app
MAIL_FILE=$WORK/mail.txt
DB_USER=mips_test
DB_PASS=$(php -r 'echo bin2hex(random_bytes(12));')

case "$DB_NAME" in
  mips_platform|mips_prod*|*production*) echo "Refusing to drop database '$DB_NAME'." >&2; exit 2 ;;
esac

PIDS=()
cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    echo "Kept: $WORK (servers still running: ${PIDS[*]:-none})"
    return
  fi
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== code copy in $APP_DIR"
mkdir -p "$APP_DIR"
(cd "$ROOT" && tar --exclude=.git --exclude=./storage --exclude=./outputs --exclude=./tests -cf - .) | (cd "$APP_DIR" && tar -xf -)
mkdir -p "$APP_DIR/storage"
cat > "$APP_DIR/fakescan.sh" <<'EOF'
#!/bin/sh
# Stand-in antivirus for tests: "infected" when the file holds the EICAR test string.
grep -q EICAR-STANDARD-ANTIVIRUS-TEST-FILE "$1" && exit 1
exit 0
EOF
chmod +x "$APP_DIR/fakescan.sh"

echo "== test configuration"
APP_KEY=$(php -r 'echo base64_encode(random_bytes(32));')
python3 - "$APP_DIR/config/config.php" "$DB_NAME" "$DB_USER" "$DB_PASS" "$APP_KEY" "$PORT" "$SMTP_PORT" <<'PY'
import sys
path, db, user, pw, key, port, smtp = sys.argv[1:]
s = open(path).read()
for old, new in [
    ("'env'     => 'production'", "'env'     => 'test'"),
    ("'url'     => 'https://dashboard.example.com'", f"'url'     => 'http://127.0.0.1:{port}'"),
    ("'name'    => 'mips_platform'", f"'name'    => '{db}'"),
    ("'user'    => 'mips_user'", f"'user'    => '{user}'"),
    ("'pass'    => 'change_me_in_production'", f"'pass'    => '{pw}'"),
    ("'secure'       => true", "'secure'       => false"),
    ("'app_key'             => '',", f"'app_key'             => '{key}',"),
    ("'require_2fa_roles'   => ['admin', 'finance']", "'require_2fa_roles'   => []"),
    ("'transport'  => 'log'", "'transport'  => 'smtp'"),
    ("'port'       => 587,", f"'port'       => {smtp},"),
    ("'encryption' => 'tls',", "'encryption' => 'none',"),
]:
    if old not in s:
        sys.exit(f"config.php changed, cannot set: {old}")
    s = s.replace(old, new, 1)
open(path, 'w').write(s)
PY

echo "== database $DB_NAME"
$MYSQL -e "DROP DATABASE IF EXISTS \`$DB_NAME\`"
sed -e "s/mips_platform/$DB_NAME/g" "$ROOT/sql/schema.sql" | $MYSQL
$MYSQL -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
           CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
           ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
           ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
           GRANT ALL ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
           GRANT ALL ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';"
HASH=$(php -r 'echo password_hash("Admin123!", PASSWORD_DEFAULT);')
$MYSQL "$DB_NAME" -e "INSERT INTO users (email, password_hash, name, role, is_active, activated_at) VALUES
  ('admin@example.com', '$HASH', 'Test Admin', 'admin', 1, NOW()),
  ('fin@example.com',   '$HASH', 'Test Finance', 'finance', 1, NOW());"

echo "== servers"
python3 "$ROOT/tests/smtpsink.py" "$MAIL_FILE" "$SMTP_PORT" & PIDS+=($!)
APP_PUBLIC="$APP_DIR/public" php -d opcache.enable=0 -S "127.0.0.1:$PORT" "$ROOT/tests/router.php" >"$WORK/server.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/login.php" && break
  sleep 0.2
done

export BASE_URL="http://127.0.0.1:$PORT" MAIL_FILE APP_DIR DB_NAME MYSQL
STATUS=0
cd "$ROOT/tests"
for t in portal_test.py staff_onboarding_test.py; do
  echo
  echo "######## $t"
  python3 "$t" || STATUS=1
done

if [ "$STATUS" != "0" ]; then
  echo
  echo "Some tests failed. Server log: $WORK/server.log (re-run with KEEP=1 to keep it)."
fi
exit $STATUS
