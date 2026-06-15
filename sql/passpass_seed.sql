-- =======================================================================
-- PassPass Platform — seed / reference data (MariaDB)
--
-- Run AFTER sql/schema.sql, sql/seed.sql and sql/passpass_schema.sql.
--   mysql -u root -p < sql/passpass_seed.sql
--
-- Demo accounts (all password: Passpass123!) — SANDBOX ONLY, change/remove
-- before any real deployment.
--   compliance@passpass.test   compliance_officer  (acts for PassPass)
--   finance@mipsit.test        finance_officer     (acts for MIPSIT)
--   merchant@demo.test         merchant
--   consumer@demo.test         consumer
-- =======================================================================

USE mips_platform;

-- ---- RBAC reference rows (code in src/Rbac.php remains authoritative) ----
INSERT INTO roles (name, description) VALUES
    ('consumer',           'End consumer paying merchants'),
    ('merchant',           'Merchant business owner'),
    ('merchant_operator',  'Staff operating a merchant account'),
    ('compliance_officer', 'PassPass compliance / KYC decisions'),
    ('finance_officer',    'Settlement and reconciliation operations'),
    ('admin',              'Platform administrator'),
    ('super_admin',        'Full access')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ---- Demo users --------------------------------------------------------
INSERT INTO users (email, password_hash, name, role, is_active) VALUES
    ('compliance@passpass.test', '$2y$12$jeRa/sKMFiQgFVA4vq5v9.eGOQezewMHCN8ljxOuN6svf9sIwYeAS', 'Compliance Officer', 'compliance_officer', 1),
    ('finance@mipsit.test',      '$2y$12$jeRa/sKMFiQgFVA4vq5v9.eGOQezewMHCN8ljxOuN6svf9sIwYeAS', 'Finance Officer',    'finance_officer',    1),
    ('merchant@demo.test',       '$2y$12$jeRa/sKMFiQgFVA4vq5v9.eGOQezewMHCN8ljxOuN6svf9sIwYeAS', 'Demo Merchant',      'merchant',           1),
    ('newmerchant@demo.test',    '$2y$12$jeRa/sKMFiQgFVA4vq5v9.eGOQezewMHCN8ljxOuN6svf9sIwYeAS', 'New Merchant',       'merchant',           1),
    ('consumer@demo.test',       '$2y$12$jeRa/sKMFiQgFVA4vq5v9.eGOQezewMHCN8ljxOuN6svf9sIwYeAS', 'Demo Consumer',      'consumer',           1)
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    name          = VALUES(name),
    role          = VALUES(role),
    is_active     = VALUES(is_active);

-- ---- Demo consumer profile --------------------------------------------
INSERT INTO consumers (user_id, consumer_reference, phone, country, kyc_status)
SELECT id, 'CON_DEMO0001', '+23055000000', 'MU', 'APPROVED'
FROM users WHERE email = 'consumer@demo.test'
ON DUPLICATE KEY UPDATE kyc_status = VALUES(kyc_status);

-- ---- Demo merchant (KYC approved, compliance cleared) ------------------
INSERT INTO merchants
    (user_id, regulated_entity, regulated_merchant_id, merchant_reference, legal_name,
     trading_name, business_type, registration_number, country, contact_email,
     kyc_status, compliance_status, risk_rating, risk_score, settlement_account, status)
SELECT id, 'PassPass', 'MER_DEMO0001', 'MER_DEMO0001', 'Demo Retail Ltd',
       'Demo Retail', 'Retail', 'C12345678', 'MU', 'merchant@demo.test',
       'APPROVED', 'CLEARED', 'LOW', 15, 'STL_ACCT_DEMO', 'ACTIVE'
FROM users WHERE email = 'merchant@demo.test'
ON DUPLICATE KEY UPDATE
    kyc_status        = VALUES(kyc_status),
    compliance_status = VALUES(compliance_status);

INSERT INTO merchant_bank_accounts
    (merchant_id, account_name, bank_name, account_number_masked, branch_code, currency, settlement_account, is_primary)
SELECT id, 'Demo Retail Ltd', 'Partner Bank', '****4321', 'PB001', 'MUR', 'STL_ACCT_DEMO', 1
FROM merchants WHERE merchant_reference = 'MER_DEMO0001'
ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary);

-- ---- Routing rules (mirrors config/config.php bootstrap defaults) -------
INSERT INTO payment_routes (payment_type, provider_name, priority, is_active) VALUES
    ('BANK_TRANSFER',      'passpass', 10, 1),
    ('QR',                 'passpass', 10, 1),
    ('PAYMENT_LINK',       'passpass', 10, 1),
    ('VIRTUAL_CREDENTIAL', 'passpass', 10, 1),
    ('PAYPUMP_TRANSFER',   'paypump',  10, 1),
    ('WORKFLOW',           'inflow',   10, 1),
    ('CARD',               'cardrail', 10, 1)
ON DUPLICATE KEY UPDATE provider_name = VALUES(provider_name), is_active = VALUES(is_active);

-- ---- Provider runtime config (non-secret; secrets live in ENV) ---------
INSERT INTO provider_configs (provider_name, mode, is_enabled, config) VALUES
    ('passpass', 'sandbox', 1, JSON_OBJECT('regulated', true,  'role', 'PSP')),
    ('paypump',  'sandbox', 1, JSON_OBJECT('regulated', false, 'role', 'PAYOUT_CONNECTOR')),
    ('inflow',   'sandbox', 1, JSON_OBJECT('regulated', false, 'role', 'WORKFLOW_ENGINE')),
    ('cardrail', 'stub',    1, JSON_OBJECT('regulated', false, 'role', 'CARD_STUB', 'pci_scope', false))
ON DUPLICATE KEY UPDATE mode = VALUES(mode), is_enabled = VALUES(is_enabled), config = VALUES(config);

-- ---- Default fee rules -------------------------------------------------
INSERT INTO fee_rules (name, scope, payment_type, percent_bps, fixed_minor, currency, priority, is_active) VALUES
    ('Standard Bank Transfer', 'GLOBAL', 'BANK_TRANSFER', 100, 0,   'MUR', 100, 1),  -- 1.00%
    ('Standard QR',            'GLOBAL', 'QR',            120, 0,   'MUR', 100, 1),  -- 1.20%
    ('Standard Payment Link',  'GLOBAL', 'PAYMENT_LINK',  150, 500, 'MUR', 100, 1),  -- 1.50% + 5.00
    ('Standard Card (stub)',   'GLOBAL', 'CARD',          250, 0,   'MUR', 100, 1)   -- 2.50%
ON DUPLICATE KEY UPDATE percent_bps = VALUES(percent_bps);

-- ---- System settings ---------------------------------------------------
INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('regulated_entity',     'PassPass'),
    ('technology_provider',  'MIPSIT Digital Ltd'),
    ('partner_bank',         'Partner Bank'),
    ('base_currency',        'MUR'),
    ('platform_sandbox',     '1'),
    ('settlement_cycle',     'T+1')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
