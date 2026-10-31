# Backup & recovery procedure

## Roles
`mips_backup` (LOGIN, BYPASSRLS, SELECT only) performs logical dumps. Restores run as a DBA superuser because `FORCE ROW LEVEL SECURITY` prevents other roles from loading tenant data.

## Backups
```bash
BACKUP_DATABASE_URL=postgres://mips_backup:***@db/mips_eos BACKUP_DIR=/secure/backups RETENTION_DAYS=35 scripts/backup.sh
```
Produces `mips_eos_<UTC>.dump` (pg_dump custom format) and a `.sha256` checksum; prunes files older than the retention period. Schedule daily (cron/K8s CronJob) and copy off-host to encrypted object storage. For production also enable PostgreSQL PITR (WAL archiving) on the managed service — logical dumps alone give a 24-hour RPO.

Recommended targets (adjust to policy): RPO ≤ 15 min with PITR, ≤ 24 h with dumps only; RTO ≤ 4 h.

## Restore
```bash
createdb -O mips_owner mips_eos_restore && psql -d mips_eos_restore -c 'CREATE EXTENSION pgcrypto'
scripts/restore.sh /secure/backups/mips_eos_<UTC>.dump postgres://postgres:***@db/mips_eos_restore
```
`restore.sh` verifies the checksum, restores, then runs `scripts/verify-restore.ts`: migrations recorded, per-tenant row counts, **audit hash-chain integrity**, and journal balance. Only switch traffic when it prints `RESTORE VERIFIED`.

## Validation performed
2026-10-31: full cycle on the DEMO dataset (≈285k transactions, 21 MB dump): backup OK, checksum OK, restore 7 s, verification `RESTORE VERIFIED` (0 chain breaks, 0 unbalanced journals). Repeat quarterly and record the result.

## Retention
Financial evidence tables are append-only by design. Data-retention periods (e.g. statutory 7 years for accounting records in Mauritius — **verify with counsel**) should be applied by an approved archival job; no automatic deletion exists in the application.
