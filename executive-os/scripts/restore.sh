#!/usr/bin/env bash
# Restore a backup into an EMPTY target database (run as a DBA superuser: FORCE RLS blocks other roles), then verify integrity.
#   scripts/restore.sh backups/mips_eos_<ts>.dump postgres://postgres:...@host/mips_eos_restore
set -euo pipefail
FILE="$1"; TARGET="$2"
sha256sum -c "$FILE.sha256"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$FILE"
DATABASE_OWNER_URL="$TARGET" npx tsx "$(dirname "$0")/verify-restore.ts"
