#!/usr/bin/env bash
# Restore a backup made by tools/backup.sh into a database, on a machine that
# holds the backup private key (gpg asks for its passphrase):
#
#   tools/restore.sh /var/backups/mips/mips-2026-11-02-214500.sql.gz.gpg mips_restore
#   tools/restore.sh <backup> mips_platform --replace     (disaster recovery: drops what is there)
#
# The MariaDB account comes from ~/.my.cnf or MIPS_RESTORE_MYCNF. A database that
# already has tables is refused without --replace. Checks the .sha256 next to the
# backup when present, loads into <database>_restoring, and only then swaps the
# tables in (the replaced ones are kept in <database>_before_restore), then prints
# the number of tables and a few row counts.
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
else
    echo "No $(basename "$sums") next to the backup: integrity not checked." >&2
fi

count() { sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$1'"; }
tables=$(count "$db")
if [ "$tables" -gt 0 ] && [ "$replace" != "--replace" ]; then
    echo "Database $db already has $tables tables: add --replace to replace them." >&2
    exit 2
fi

# Load into a staging database first: a wrong passphrase, a damaged file or an import
# error leaves $db exactly as it was.
staging="${db}_restoring"
sql "DROP DATABASE IF EXISTS \`$staging\`; CREATE DATABASE \`$staging\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
if ! gpg --quiet --decrypt "$file" | gunzip | "${client[@]}" "$staging"; then
    sql "DROP DATABASE IF EXISTS \`$staging\`"
    echo "Restore failed: $db was not touched." >&2
    exit 1
fi
[ "$(count "$staging")" -gt 0 ] || { sql "DROP DATABASE \`$staging\`"; echo "The backup holds no table: $db was not touched." >&2; exit 1; }

# Swap in one RENAME TABLE statement (atomic). The tables replaced are kept in ${db}_before_restore.
sql "CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
renames=""
if [ "$tables" -gt 0 ]; then
    old="${db}_before_restore"
    sql "DROP DATABASE IF EXISTS \`$old\`; CREATE DATABASE \`$old\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    renames=$(sql "SET SESSION group_concat_max_len = 1000000; SELECT GROUP_CONCAT(CONCAT('\`$db\`.\`', table_name, '\` TO \`$old\`.\`', table_name, '\`') SEPARATOR ', ') FROM information_schema.tables WHERE table_schema = '$db'")
    renames="$renames, "
fi
renames="$renames$(sql "SET SESSION group_concat_max_len = 1000000; SELECT GROUP_CONCAT(CONCAT('\`$staging\`.\`', table_name, '\` TO \`$db\`.\`', table_name, '\`') SEPARATOR ', ') FROM information_schema.tables WHERE table_schema = '$staging'")"
sql "SET FOREIGN_KEY_CHECKS = 0; RENAME TABLE $renames"
sql "DROP DATABASE \`$staging\`"
[ "$tables" -gt 0 ] && echo "Previous tables kept in ${db}_before_restore (drop it once the restore is checked)."

echo "Restored into $db: $(sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$db'") tables."
for t in organizations users facturo_documents; do
    echo "  $t: $(sql "SELECT COUNT(*) FROM \`$db\`.\`$t\`" 2>/dev/null || echo '?') rows"
done
echo "Next: point a copy of the application at $db and log in before trusting this backup."
