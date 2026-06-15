-- Migration: store the encrypted API signing secret for HMAC verification.
-- Safe to run once on an existing install (skip if the column already exists).
--   mysql -u root -p mips_platform < sql/migrations/2026_06_15_api_key_secret.sql

USE mips_platform;

ALTER TABLE api_keys
    ADD COLUMN secret_encrypted VARCHAR(512) NULL AFTER key_hash;
