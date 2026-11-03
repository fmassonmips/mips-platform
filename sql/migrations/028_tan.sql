-- MRA Tax Account Number of the company, separate from the VAT number: companies
-- not registered for VAT have a TAN too and can fiscalise their invoices.
-- Apply once on an existing database, after 027_ops.sql:
--   mysql -u root -p mips_platform < sql/migrations/028_tan.sql

ALTER TABLE organizations ADD COLUMN tan VARCHAR(8) NULL AFTER vat_number;
-- Until now the VAT number was sent as the TAN: keep it where it is a plain 8-digit TAN.
UPDATE organizations SET tan = vat_number WHERE vat_number REGEXP '^[0-9]{8}$';
