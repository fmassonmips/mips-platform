#!/usr/bin/env bash
# Nightly backup: the whole database (every company's data, images included)
# and config/config.local.php, each encrypted to the MIPS backup public key,
# kept MIPS_BACKUP_KEEP_DAYS days on this server and copied off it.
# The private key never goes on the server: a stolen server or backup copy
# cannot be read. Restore with tools/restore.sh (docs/deploiement.md § 3).
#
#   45 21 * * *  /var/www/mips/tools/cron.sh backup /var/www/mips/tools/backup.sh >> /var/log/mips/cron.log 2>&1
#
# Settings (environment, or MIPS_BACKUP_ENV, default /etc/mips/backup.env):
#   MIPS_BACKUP_KEY            public key file (gpg --export --armor), default /etc/mips/backup-public-key.asc
#   MIPS_BACKUP_DIR            default /var/backups/mips
#   MIPS_BACKUP_DB             default mips_platform
#   MIPS_BACKUP_MYCNF          MariaDB client file for a read-only backup account, default /etc/mips/backup.my.cnf
#   MIPS_BACKUP_KEEP_DAYS      default 30
#   MIPS_BACKUP_RCLONE_REMOTE  off-site copy with rclone, e.g. b2:mips-backups
#   MIPS_BACKUP_RSYNC_TARGET   off-site copy with rsync, e.g. backup@host:/srv/mips/
#   MIPS_BACKUP_LOCAL_ONLY=1   accept no off-site copy (otherwise: exit 1, so the watchdog alerts)
# Exits 0 only when the backup was written and copied off-site.
set -euo pipefail
umask 077

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE=${MIPS_BACKUP_ENV:-/etc/mips/backup.env}
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
KEY=${MIPS_BACKUP_KEY:-/etc/mips/backup-public-key.asc}
DIR=${MIPS_BACKUP_DIR:-/var/backups/mips}
DB=${MIPS_BACKUP_DB:-mips_platform}
MYCNF=${MIPS_BACKUP_MYCNF:-/etc/mips/backup.my.cnf}
KEEP=${MIPS_BACKUP_KEEP_DAYS:-30}
RCLONE=${MIPS_BACKUP_RCLONE_REMOTE:-}
RSYNC=${MIPS_BACKUP_RSYNC_TARGET:-}

[ -r "$KEY" ] || { echo "Backup public key not found: $KEY" >&2; exit 1; }
mkdir -p "$DIR"
DUMP=$(command -v mariadb-dump || command -v mysqldump)
dump_args=()
[ -r "$MYCNF" ] && dump_args+=("--defaults-extra-file=$MYCNF")   # must come first
dump_args+=(--single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces --default-character-set=utf8mb4 "$DB")

GNUPGHOME=$(mktemp -d); export GNUPGHOME   # throwaway keyring: the key is used from its file, nothing to trust
trap 'rm -rf "$GNUPGHOME"; rm -f "$DIR"/*.part' EXIT
encrypt() { gpg --batch --quiet --no-tty --trust-model always --recipient-file "$KEY" --encrypt --output "$1"; }

stamp=$(date +%F-%H%M%S)
db_file="$DIR/mips-$stamp.sql.gz.gpg"
"$DUMP" "${dump_args[@]}" | gzip -6 | encrypt "$db_file.part"
mv "$db_file.part" "$db_file"
files=("$db_file")
if [ -f "$ROOT/config/config.local.php" ]; then
    conf_file="$DIR/mips-$stamp-config.php.gpg"
    encrypt "$conf_file.part" < "$ROOT/config/config.local.php"
    mv "$conf_file.part" "$conf_file"
    files+=("$conf_file")
fi
size=$(stat -c %s "$db_file")
[ "$size" -ge 2048 ] || { echo "Backup suspiciously small ($size bytes): $db_file" >&2; exit 1; }
(cd "$DIR" && sha256sum "${files[@]##*/}" > "mips-$stamp.sha256")
files+=("$DIR/mips-$stamp.sha256")
echo "Backup written: $db_file ($((size / 1024)) KB)"

find "$DIR" -maxdepth 1 -name 'mips-*' -type f -mtime +"$KEEP" -print -delete | sed 's/^/Removed (older than '"$KEEP"' days): /'

copied=0
if [ -n "$RCLONE" ]; then
    for f in "${files[@]}"; do rclone copy "$f" "$RCLONE"; done   # rclone copy takes one source
    echo "Copied off-site: $RCLONE"; copied=1
fi
if [ -n "$RSYNC" ]; then
    rsync -a "${files[@]}" "$RSYNC"
    echo "Copied off-site: $RSYNC"; copied=1
fi
if [ "$copied" -eq 0 ] && [ "${MIPS_BACKUP_LOCAL_ONLY:-0}" != "1" ]; then
    echo "No off-site copy configured (MIPS_BACKUP_RCLONE_REMOTE or MIPS_BACKUP_RSYNC_TARGET): a backup on the same server is lost with it." >&2
    exit 1
fi
