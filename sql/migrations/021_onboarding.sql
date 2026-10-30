-- First steps: the « Bien démarrer » checklist shows until it is completed or hidden.
-- Apply once on an existing database, after 020_backoffice.sql:
--   mysql -u root -p mips_platform < sql/migrations/021_onboarding.sql

ALTER TABLE organizations ADD COLUMN onboarded_at DATETIME NULL AFTER suspended_reason;
UPDATE organizations SET onboarded_at = created_at;   -- companies already using MIPS do not get the checklist
