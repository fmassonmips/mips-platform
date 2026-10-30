-- Accounts hardening: a sign-up link sets the password chosen in that sign-up,
-- and only an address never confirmed can receive a confirmation link.
-- Apply once on an existing database, after 018_account_tokens.sql:
--   mysql -u root -p mips_platform < sql/migrations/019_account_hardening.sql

ALTER TABLE users ADD COLUMN verified_at DATETIME NULL AFTER password_changed_at;
UPDATE users SET verified_at = created_at WHERE is_active = 1;

ALTER TABLE user_tokens ADD COLUMN password_hash VARCHAR(255) NULL AFTER token_hash;
