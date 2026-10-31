#!/usr/bin/env bash
# Restore a backup made by tools/backup.sh into a database, on a machine that
# holds the backup private key (gpg asks for its passphrase):
#
#   tools/restore.sh /var/backups/mips/mips-2026-11-02-214500.sql.gz.gpg mips_restore
#   tools/restore.sh <backup> mips_platform --replace     (disaster recovery: drops what is there)
#
# The MariaDB account comes from ~/.my.cnf or MIPS_RESTORE_MYCNF. A database that
# already has tables is refused without --replace. Checks the .sha256 next to the
# backup when present, then prints the number of tables and a few row counts.
# The config backup (…-config.php.gpg) is decrypted by hand:
#   gpg --decrypt mips-…-config.php.gpg > config/config.local.php
set -euo pipefail

file=${1:?usage: restore.sh <backup.sql.gz.gpg> <database> [--replace]}
db=${2:?usage: restore.sh <backup.sql.gz.gpg> <database> [--replace]}
replace=${3:-}
[[ "$db" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Invalid database name: $db" >&2; exit 2; }
[ -r "$file" ] || { echo "Backup not found: $file" >&2; exit 2; }

client=(mysql)
[ -n "${MIPS_RESTORE_MYCNF:-}" ] && client=(mysql "--defaults-extra-file=$MIPS_RESTORE_MYCNF")
sql() { "${client[@]}" -N -e "$1"; }

sums="${file%.sql.gz.gpg}.sha256"
if [ -f "$sums" ]; then
    (cd "$(dirname "$file")" && grep " $(basename "$file")\$" "$(basename "$sums")" | sha256sum -c --quiet -) \
        || { echo "Checksum mismatch: $file is damaged." >&2; exit 1; }
    echo "Checksum OK."
fi

tables=$(sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$db'")
if [ "$tables" -gt 0 ]; then
    if [ "$replace" != "--replace" ]; then
        echo "Database $db already has $tables tables: add --replace to drop them." >&2
        exit 2
    fi
    sql "DROP DATABASE \`$db\`"
fi
sql "CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

gpg --quiet --decrypt "$file" | gunzip | "${client[@]}" "$db"

echo "Restored into $db: $(sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$db'") tables."
for t in organizations users facturo_documents; do
    echo "  $t: $(sql "SELECT COUNT(*) FROM \`$db\`.\`$t\`" 2>/dev/null || echo '?') rows"
done
echo "Next: point a copy of the application at $db and log in before trusting this backup."
