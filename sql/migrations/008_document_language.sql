-- Facturo: documents in French or English, chosen per company.
-- Apply once on an existing database, after 007_clientbloom_invoice_rate.sql:
--   mysql -u root -p mips_platform < sql/migrations/008_document_language.sql

ALTER TABLE organizations
    ADD COLUMN document_language CHAR(2) NOT NULL DEFAULT 'fr' AFTER phone;

ALTER TABLE facturo_documents
    ADD COLUMN language CHAR(2) NULL AFTER client_snapshot;

-- Documents already issued were printed in French: freeze that.
UPDATE facturo_documents SET language = 'fr' WHERE status <> 'draft';
