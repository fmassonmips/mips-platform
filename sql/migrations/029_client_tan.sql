-- MRA Tax Account Number of Facturo clients, separate from their VAT number
-- (sent as the buyer's TAN; a client not registered for VAT can have one).
-- Apply once on an existing database, after 028_tan.sql:
--   mysql -u root -p mips_platform < sql/migrations/029_client_tan.sql

ALTER TABLE facturo_clients ADD COLUMN tan VARCHAR(8) NULL AFTER vat_number;
UPDATE facturo_clients SET tan = vat_number WHERE vat_number REGEXP '^[0-9]{8}$';
