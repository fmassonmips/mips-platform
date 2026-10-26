-- Link Facturo and ClientBloom: paid invoices earn cashback.
-- Apply once on an existing database, after 005_clientbloom.sql:
--   mysql -u root -p mips_platform < sql/migrations/006_facturo_clientbloom.sql

ALTER TABLE clientbloom_settings
    ADD COLUMN facturo_rewards TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_months;

ALTER TABLE facturo_clients
    ADD COLUMN clientbloom_customer_id BIGINT UNSIGNED NULL AFTER vat_number,
    ADD CONSTRAINT fk_facturo_clients_cb FOREIGN KEY (clientbloom_customer_id)
        REFERENCES clientbloom_customers (id) ON DELETE SET NULL;

ALTER TABLE facturo_documents
    ADD COLUMN clientbloom_tx_id BIGINT UNSIGNED NULL AFTER mra_fiscalised_at,
    ADD COLUMN clientbloom_note  VARCHAR(255)    NULL AFTER clientbloom_tx_id;
