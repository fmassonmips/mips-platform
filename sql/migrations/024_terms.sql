-- Terms of use and privacy policy: which version each user accepted, and when.
-- Apply once on an existing database, after 023_closure.sql:
--   mysql -u root -p mips_platform < sql/migrations/024_terms.sql
-- Existing users have none: the dashboard asks them to accept the version in force.

ALTER TABLE users ADD COLUMN terms_version VARCHAR(20) NULL AFTER last_login_at;
ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL AFTER terms_version;
