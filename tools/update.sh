#!/usr/bin/env bash
# Update a server installed by tools/install.sh, as root from the code checkout:
#
#   sudo /var/www/mips/tools/update.sh              latest commit of the current branch (git fetch)
#   sudo MIPS_UPDATE_REF=<commit> tools/update.sh   a given commit (must follow the current one)
#   sudo tools/update.sh --baseline                 once, on a database created before schema_migrations
#                                                    existed: records every migration file as applied
#
# Steps: encrypted backup (tools/backup.sh, as mips-backup) → fast-forward of the code →
# migrations not yet recorded in schema_migrations, in order → PHP-FPM reload → checks.
# A failed check puts the previous code back; migrations already applied stay (they only
# add), and the backup taken at the start is there to restore (docs/incidents.md, fiche 19).
#   MIPS_UPDATE_FETCH=0   do not fetch (the commit is already in the checkout)
#   MIPS_UPDATE_BACKUP=0  skip the backup (tests only)
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
APP=$(cd "$(dirname "$0")/.." && pwd)
DB=mips_platform
cd "$APP"
git() { command git -c safe.directory="$APP" "$@"; }
mig_table() { mysql "$DB" -e "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (version)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"; }

if [ "${1:-}" = "--baseline" ]; then
    mig_table
    for f in sql/migrations/*.sql; do mysql "$DB" -e "INSERT IGNORE INTO schema_migrations (version) VALUES ('$(basename "$f")')"; done
    echo "Recorded $(mysql -N "$DB" -e 'SELECT COUNT(*) FROM schema_migrations') migrations as applied. Only do this on a database that is up to date with this code."
    exit 0
fi
if ! mysql -N "$DB" -e "SELECT 1 FROM information_schema.tables WHERE table_schema = '$DB' AND table_name = 'schema_migrations'" | grep -q 1; then
    echo "No schema_migrations table: this database predates it. If it is up to date with the current code, run: sudo $0 --baseline" >&2
    exit 1
fi
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "The checkout has local changes: commit or discard them first." >&2; git status --short >&2; exit 1; }

old=$(git rev-parse HEAD)
if [ "${MIPS_UPDATE_FETCH:-1}" = 1 ]; then git fetch -q origin; fi
target=${MIPS_UPDATE_REF:-$(git rev-parse '@{u}')}
target=$(git rev-parse "$target^{commit}")
if [ "$target" = "$old" ]; then echo "Already at $(git log -1 --format='%h %s')."; exit 0; fi
git merge-base --is-ancestor "$old" "$target" || { echo "$target does not follow the current commit $old: refusing (no history rewrite on a server)." >&2; exit 1; }
echo "Updating $(git log -1 --format='%h %s' "$old")"
echo "      to $(git log -1 --format='%h %s' "$target")"

if [ "${MIPS_UPDATE_BACKUP:-1}" = 1 ]; then
    echo "== Backup"
    sudo -u mips-backup env MIPS_BACKUP_LOCAL_ONLY="${MIPS_BACKUP_LOCAL_ONLY:-0}" "$APP/tools/cron.sh" backup "$APP/tools/backup.sh" \
        || { echo "Backup failed: update not started (see /var/backups/mips/backup.log)." >&2; exit 1; }
fi

echo "== Code"
git merge -q --ff-only "$target"
install -d -m 750 -o www-data -g www-data /var/lib/mips   # closure journal (servers installed before it existed)

rollback() {
    echo "!! $1 — putting back $(git log -1 --format='%h' "$old")." >&2
    git reset -q --hard "$old"
    systemctl reload php8.3-fpm
    echo "Code restored. Migrations applied in this run stay; the backup from the start of this run is in /var/backups/mips." >&2
    exit 1
}

echo "== Migrations"
mig_table
applied=0
for f in sql/migrations/*.sql; do
    v=$(basename "$f")
    [ -n "$(mysql -N "$DB" -e "SELECT 1 FROM schema_migrations WHERE version = '$v'")" ] && continue
    echo "   $v"
    mysql "$DB" < "$f" || rollback "migration $v failed"
    mysql "$DB" -e "INSERT INTO schema_migrations (version) VALUES ('$v')"
    applied=$((applied + 1))
done
echo "   $applied applied."

echo "== Reload and checks"
systemctl reload php8.3-fpm
host=$(php -r 'define("MIPS_NO_SESSION", true); $_SERVER["HTTP_USER_AGENT"] = "cli"; require "src/bootstrap.php"; echo parse_url($GLOBALS["config"]["app"]["url"], PHP_URL_HOST);')
for _ in $(seq 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $host" http://127.0.0.1/login.php || true)
    [ "$code" = 200 ] || [ "$code" = 301 ] && break
    sleep 0.5
done
[ "$code" = 200 ] || [ "$code" = 301 ] || rollback "login.php answers HTTP $code"
health=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $host" http://127.0.0.1/health.php || true)
[ "$health" = 200 ] || [ "$health" = 503 ] || rollback "health.php answers HTTP $health"
echo "Done: $(git log -1 --format='%h %s'). health.php: $health."
