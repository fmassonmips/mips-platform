#!/usr/bin/env bash
# Obtain a session cookie for local testing: scripts/dev-login.sh [email] > cookie.txt
# Prints a curl cookie-jar path containing an authenticated session.
set -euo pipefail
EMAIL="${1:-ceo@mips.demo}"; PASS="${DEMO_PASSWORD:-Demo-Passw0rd-2026}"; BASE="${BASE_URL:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/mips-cookie-$(echo "$EMAIL" | tr '@.' '__').txt}"
node "$(dirname "$0")/dev-login.cjs" "$EMAIL" "$PASS" "$BASE" "$JAR"
echo "$JAR"
