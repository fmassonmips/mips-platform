-- One-time cluster bootstrap (run as a superuser). Replace passwords via your secrets manager.
CREATE ROLE mips_owner LOGIN PASSWORD 'owner_dev_pw';
CREATE ROLE mips_app LOGIN PASSWORD 'app_dev_pw' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
-- Backup role: read-only, BYPASSRLS so logical backups include every tenant. Restores run as a DBA superuser.
CREATE ROLE mips_backup LOGIN PASSWORD 'backup_dev_pw' BYPASSRLS NOSUPERUSER;
CREATE DATABASE mips_eos OWNER mips_owner;
CREATE DATABASE mips_eos_test OWNER mips_owner;
\connect mips_eos
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\connect mips_eos_test
CREATE EXTENSION IF NOT EXISTS pgcrypto;
