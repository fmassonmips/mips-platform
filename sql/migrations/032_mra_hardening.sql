-- MRA token encrypted at rest like the session key; IRN entered by hand for a document
-- sent without an answer, once the company found it on the MRA portal.
-- Apply once on an existing database, after 031_schema_migrations.sql:
--   mysql -u root -p mips_platform < sql/migrations/032_mra_hardening.sql
-- (or tools/update.sh). Cached tokens are dropped: each company re-authenticates on its next send.

DELETE FROM mra_tokens;
ALTER TABLE mra_tokens DROP COLUMN token, ADD COLUMN token_enc TEXT NOT NULL AFTER organization_id;
ALTER TABLE facturo_documents ADD COLUMN mra_irn_entered_by BIGINT UNSIGNED NULL AFTER mra_irn;
