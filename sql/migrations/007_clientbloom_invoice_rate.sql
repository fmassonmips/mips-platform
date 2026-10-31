-- ClientBloom: separate cashback rate and per-invoice cap for paid Facturo invoices.
-- Apply once on an existing database, after 006_facturo_clientbloom.sql:
--   mysql -u root -p mips_platform < sql/migrations/007_clientbloom_invoice_rate.sql

ALTER TABLE clientbloom_settings
    ADD COLUMN invoice_cashback_bp INT UNSIGNED NOT NULL DEFAULT 100 AFTER facturo_rewards,
    ADD COLUMN invoice_cap_cents   BIGINT       NOT NULL DEFAULT 0   AFTER invoice_cashback_bp;
