-- Facturo: document language per client, overriding the company's.
-- Apply once on an existing database, after 008_document_language.sql:
--   mysql -u root -p mips_platform < sql/migrations/009_client_document_language.sql

ALTER TABLE facturo_clients
    ADD COLUMN document_language CHAR(2) NULL AFTER vat_number;
