-- ClientBloom: CRM and closed-loop cashback loyalty.
-- Apply once on an existing database, after 004_mra_einvoicing.sql:
--   mysql -u root -p mips_platform < sql/migrations/005_clientbloom.sql

-- ---- clientbloom_settings (loyalty program rules, one row per org) -----
CREATE TABLE IF NOT EXISTS clientbloom_settings (
    organization_id     BIGINT UNSIGNED NOT NULL,
    cashback_bp         INT UNSIGNED NOT NULL DEFAULT 500,     -- 5.00 % of the amount paid
    min_redeem_cents    BIGINT       NOT NULL DEFAULT 10000,   -- smallest amount a customer can use
    welcome_bonus_cents BIGINT       NOT NULL DEFAULT 0,
    expiry_months       SMALLINT UNSIGNED NOT NULL DEFAULT 12, -- balance lost after N months without activity; 0 = never
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id),
    CONSTRAINT fk_cb_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- clientbloom_customers ----------------------------------------------
-- balance/totals are denormalized from the ledger, updated in the same
-- transaction as each ledger entry (customer row locked).
CREATE TABLE IF NOT EXISTS clientbloom_customers (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id   BIGINT UNSIGNED NOT NULL,
    name              VARCHAR(120) NOT NULL,
    phone             VARCHAR(20)  NULL,                    -- digits only, local format
    email             VARCHAR(254) NULL,
    birthday          DATE         NULL,
    tags              VARCHAR(255) NULL,                    -- comma-separated
    marketing_consent TINYINT(1)   NOT NULL DEFAULT 0,
    consent_at        DATETIME     NULL,
    public_token      VARCHAR(64)  NULL,                    -- loyalty card link
    balance_cents     BIGINT       NOT NULL DEFAULT 0,
    total_spent_cents BIGINT       NOT NULL DEFAULT 0,
    visits            INT UNSIGNED NOT NULL DEFAULT 0,
    last_visit_at     DATETIME     NULL,
    last_activity_at  DATETIME     NULL,                    -- earn or redeem; drives expiry
    erased_at         DATETIME     NULL,                    -- personal data removed on request
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cb_customers_phone (organization_id, phone),
    UNIQUE KEY uq_cb_customers_token (public_token),
    KEY idx_cb_customers_org_name (organization_id, name),
    KEY idx_cb_customers_org_activity (organization_id, last_activity_at),
    CONSTRAINT fk_cb_customers_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- clientbloom_transactions (append-only cashback ledger) -------------
CREATE TABLE IF NOT EXISTS clientbloom_transactions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NOT NULL,
    type            VARCHAR(16)  NOT NULL,     -- purchase | redeem | bonus | adjust | expire | reversal
    amount_cents    BIGINT       NOT NULL DEFAULT 0,        -- purchase amount (purchase only)
    cashback_cents  BIGINT       NOT NULL,                  -- signed change of the balance
    balance_after   BIGINT       NOT NULL,
    reference       VARCHAR(100) NULL,                      -- receipt / invoice number, reason
    reversal_of     BIGINT UNSIGNED NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cb_tx_reversal (reversal_of),             -- a transaction is reversed at most once
    KEY idx_cb_tx_customer (customer_id, id),
    KEY idx_cb_tx_org_date (organization_id, created_at),
    CONSTRAINT fk_cb_tx_org      FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_cb_tx_customer FOREIGN KEY (customer_id)     REFERENCES clientbloom_customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- clientbloom_notes (CRM timeline) -----------------------------------
CREATE TABLE IF NOT EXISTS clientbloom_notes (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NOT NULL,
    body            TEXT         NOT NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cb_notes_customer (customer_id, id),
    CONSTRAINT fk_cb_notes_org      FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_cb_notes_customer FOREIGN KEY (customer_id)     REFERENCES clientbloom_customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
