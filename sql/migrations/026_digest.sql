-- Monday summary e-mail (owner and administrators): who turned it off.
-- Apply once on an existing database, after 025_usage.sql:
--   mysql -u root -p mips_platform < sql/migrations/026_digest.sql

ALTER TABLE users ADD COLUMN digest_opt_out TINYINT(1) NOT NULL DEFAULT 0 AFTER terms_accepted_at;
