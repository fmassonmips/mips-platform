#!/usr/bin/env bash
# Logical backup of the Executive OS database (custom format), with SHA-256 and retention.
#   BACKUP_DATABASE_URL=postgres://mips_backup:...@host/mips_eos BACKUP_DIR=./backups RETENTION_DAYS=35 scripts/backup.sh
set -euo pipefail
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL (role mips_backup, BYPASSRLS read-only) is required}"
DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"; mkdir -p "$DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ); FILE="$DIR/mips_eos_$TS.dump"
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$BACKUP_DATABASE_URL"
sha256sum "$FILE" > "$FILE.sha256"
find "$DIR" -name 'mips_eos_*.dump*' -mtime +"${RETENTION_DAYS:-35}" -delete
echo "$FILE"
