-- ClientBloom: a sale submitted twice (network retry, second click after an
-- error) is recorded once. The counter form sends a random key per sale.
-- Apply once on an existing database, after 029_client_tan.sql:
--   mysql -u root -p mips_platform < sql/migrations/030_checkout_key.sql

ALTER TABLE clientbloom_transactions
    ADD COLUMN request_key CHAR(32) NULL AFTER reversal_of,
    ADD UNIQUE KEY uq_cb_tx_request (organization_id, request_key);
