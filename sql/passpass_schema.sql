-- =======================================================================
-- PassPass Platform — application schema (MariaDB / MySQL)
--
-- Regulated entity : PassPass Ltd        (PSP licence holder)
-- Technology layer : MIPSIT Digital Ltd  (orchestration / this platform)
--
-- Run AFTER sql/schema.sql (which creates the database and the users table).
--   mysql -u root -p < sql/schema.sql
--   mysql -u root -p < sql/passpass_schema.sql
--
-- Conventions:
--   * Money is stored as BIGINT in MINOR units (e.g. cents). Never floats.
--   * Currency is CHAR(3) ISO-4217, default MUR.
--   * Opaque references (TXN_..., MER_..., RGT_...) are safe to expose.
--   * ENUM values mirror the PHP enums in src/Domain/*.
-- =======================================================================

USE mips_platform;

SET FOREIGN_KEY_CHECKS = 0;

-- ---- RBAC reference tables (code in src/Rbac.php is authoritative) -------
CREATE TABLE IF NOT EXISTS roles (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(64)  NOT NULL,
    description VARCHAR(255)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(128) NOT NULL,
    description VARCHAR(255)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_permissions_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INT UNSIGNED NOT NULL,
    permission_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles (id)       ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- consumers ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumers (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id            BIGINT UNSIGNED NOT NULL,
    consumer_reference VARCHAR(40)  NOT NULL,
    phone              VARCHAR(32)   NULL,
    country            CHAR(2)       NOT NULL DEFAULT 'MU',
    kyc_status         ENUM('DRAFT','SUBMITTED','REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_consumers_reference (consumer_reference),
    UNIQUE KEY uq_consumers_user (user_id),
    CONSTRAINT fk_consumers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- merchants ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id               BIGINT UNSIGNED NOT NULL,           -- owner account
    regulated_entity      VARCHAR(64)  NOT NULL DEFAULT 'PassPass',
    regulated_merchant_id VARCHAR(40)   NULL,                 -- issued by PassPass
    merchant_reference    VARCHAR(40)  NOT NULL,              -- platform-side
    legal_name            VARCHAR(200) NOT NULL,
    trading_name          VARCHAR(200)  NULL,
    business_type         VARCHAR(80)   NULL,
    registration_number   VARCHAR(80)   NULL,
    country               CHAR(2)      NOT NULL DEFAULT 'MU',
    contact_email         VARCHAR(254)  NULL,
    contact_phone         VARCHAR(32)   NULL,
    kyc_status            ENUM('DRAFT','SUBMITTED','REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
    compliance_status     ENUM('PENDING','CLEARED','FLAGGED','SUSPENDED','CLOSED') NOT NULL DEFAULT 'PENDING',
    risk_rating           ENUM('LOW','MEDIUM','HIGH')  NULL,
    risk_score            INT UNSIGNED  NULL,
    settlement_account    VARCHAR(64)   NULL,                 -- primary settlement identifier
    status                ENUM('ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchants_reference (merchant_reference),
    UNIQUE KEY uq_merchants_regulated_id (regulated_merchant_id),
    KEY idx_merchants_user (user_id),
    KEY idx_merchants_kyc (kyc_status),
    KEY idx_merchants_compliance (compliance_status),
    CONSTRAINT fk_merchants_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- merchant_documents ------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_documents (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id    BIGINT UNSIGNED NOT NULL,
    doc_type       VARCHAR(64)  NOT NULL,    -- e.g. CERT_INCORPORATION, ID_DIRECTOR
    file_reference VARCHAR(255) NOT NULL,    -- storage key; never the raw file in DB
    status         ENUM('PENDING','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING',
    uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_docs_merchant (merchant_id),
    CONSTRAINT fk_docs_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- merchant_bank_accounts -------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_bank_accounts (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id           BIGINT UNSIGNED NOT NULL,
    account_name          VARCHAR(200) NOT NULL,
    bank_name             VARCHAR(120) NOT NULL,
    account_number_masked VARCHAR(40)  NOT NULL,   -- masked; full PAN/IBAN not stored
    branch_code           VARCHAR(40)   NULL,
    currency              CHAR(3)      NOT NULL DEFAULT 'MUR',
    settlement_account    VARCHAR(64)   NULL,       -- partner-bank settlement identifier
    is_primary            TINYINT(1)   NOT NULL DEFAULT 0,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bank_merchant (merchant_id),
    CONSTRAINT fk_bank_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- kyc_reviews -------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_reviews (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id      BIGINT UNSIGNED NOT NULL,
    status           ENUM('DRAFT','SUBMITTED','REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    reviewer_user_id BIGINT UNSIGNED  NULL,         -- PassPass compliance officer
    decision         VARCHAR(40)      NULL,
    notes            TEXT             NULL,
    submitted_at     DATETIME         NULL,
    decided_at       DATETIME         NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kyc_merchant (merchant_id),
    CONSTRAINT fk_kyc_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
    CONSTRAINT fk_kyc_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- risk_reviews ------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_reviews (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id      BIGINT UNSIGNED NOT NULL,
    score            INT UNSIGNED NOT NULL DEFAULT 0,
    rating           ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'LOW',
    factors          JSON             NULL,
    reviewer_user_id BIGINT UNSIGNED  NULL,
    notes            TEXT             NULL,         -- AML notes / compliance comments
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_risk_merchant (merchant_id),
    CONSTRAINT fk_risk_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
    CONSTRAINT fk_risk_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- virtual payment profiles / aliases / credentials ------------------
CREATE TABLE IF NOT EXISTS virtual_payment_profiles (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    owner_user_id     BIGINT UNSIGNED NOT NULL,
    profile_reference VARCHAR(40)  NOT NULL,
    label             VARCHAR(120)  NULL,
    is_active         TINYINT(1)   NOT NULL DEFAULT 1,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_vpp_reference (profile_reference),
    KEY idx_vpp_owner (owner_user_id),
    CONSTRAINT fk_vpp_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_aliases (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    profile_id  BIGINT UNSIGNED NOT NULL,
    alias       VARCHAR(120) NOT NULL,            -- e.g. @merchant, phone, handle
    alias_type  ENUM('HANDLE','PHONE','EMAIL','VPA') NOT NULL DEFAULT 'HANDLE',
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_alias (alias),
    KEY idx_alias_profile (profile_id),
    CONSTRAINT fk_alias_profile FOREIGN KEY (profile_id) REFERENCES virtual_payment_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A virtual credential is an identifier (routing/alias/QR/future token), NOT a
-- real card. No PAN/CVV is ever stored — only opaque references/tokens.
CREATE TABLE IF NOT EXISTS virtual_credentials (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    profile_id           BIGINT UNSIGNED NOT NULL,
    credential_reference VARCHAR(40)  NOT NULL,
    type                 ENUM('BANK_ROUTING','PAYMENT_ALIAS','QR_PROFILE','CARD_TOKEN','WALLET') NOT NULL,
    token_reference      VARCHAR(120)  NULL,       -- opaque token, never raw PAN
    is_active            TINYINT(1)   NOT NULL DEFAULT 1,
    expires_at           DATETIME      NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_vc_reference (credential_reference),
    KEY idx_vc_profile (profile_id),
    CONSTRAINT fk_vc_profile FOREIGN KEY (profile_id) REFERENCES virtual_payment_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- collection instruments: requests / links / QR ---------------------
CREATE TABLE IF NOT EXISTS payment_requests (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id       BIGINT UNSIGNED NOT NULL,
    request_reference VARCHAR(40)  NOT NULL,
    amount_minor      BIGINT       NOT NULL,
    currency          CHAR(3)      NOT NULL DEFAULT 'MUR',
    description       VARCHAR(255)  NULL,
    status            ENUM('CREATED','PENDING_PAYMENT','PAID','CANCELLED','FAILED') NOT NULL DEFAULT 'CREATED',
    expires_at        DATETIME      NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_preq_reference (request_reference),
    KEY idx_preq_merchant (merchant_id),
    CONSTRAINT fk_preq_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_links (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id    BIGINT UNSIGNED NOT NULL,
    link_reference VARCHAR(40)  NOT NULL,
    slug           VARCHAR(64)  NOT NULL,          -- public URL slug
    amount_minor   BIGINT        NULL,             -- NULL = payer enters amount
    currency       CHAR(3)      NOT NULL DEFAULT 'MUR',
    description    VARCHAR(255)  NULL,
    status         ENUM('ACTIVE','EXPIRED','DISABLED') NOT NULL DEFAULT 'ACTIVE',
    max_uses       INT UNSIGNED  NULL,
    uses           INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at     DATETIME      NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_link_reference (link_reference),
    UNIQUE KEY uq_link_slug (slug),
    KEY idx_link_merchant (merchant_id),
    CONSTRAINT fk_link_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qr_profiles (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id  BIGINT UNSIGNED NOT NULL,
    qr_reference VARCHAR(40)  NOT NULL,
    qr_type      ENUM('STATIC','DYNAMIC','REQUEST') NOT NULL DEFAULT 'STATIC',
    amount_minor BIGINT        NULL,               -- NULL for static/open QR
    currency     CHAR(3)      NOT NULL DEFAULT 'MUR',
    payload      TEXT          NULL,               -- encoded QR payload
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_qr_reference (qr_reference),
    KEY idx_qr_merchant (merchant_id),
    CONSTRAINT fk_qr_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- settlement batches (created before transactions/settlements ref) ---
CREATE TABLE IF NOT EXISTS settlement_batches (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    batch_reference    VARCHAR(40)  NOT NULL,
    regulated_entity   VARCHAR(64)  NOT NULL DEFAULT 'PassPass',
    provider_name      VARCHAR(40)  NOT NULL DEFAULT 'passpass',
    status             ENUM('OPEN','PROCESSING','SETTLED','FAILED','RECONCILED') NOT NULL DEFAULT 'OPEN',
    total_amount_minor BIGINT       NOT NULL DEFAULT 0,
    currency           CHAR(3)      NOT NULL DEFAULT 'MUR',
    transaction_count  INT UNSIGNED NOT NULL DEFAULT 0,
    settlement_account VARCHAR(64)   NULL,
    scheduled_at       DATETIME      NULL,
    executed_at        DATETIME      NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_batch_reference (batch_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settlements (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    settlement_reference VARCHAR(40) NOT NULL,
    batch_id            BIGINT UNSIGNED  NULL,
    merchant_id         BIGINT UNSIGNED NOT NULL,
    regulated_entity    VARCHAR(64)  NOT NULL DEFAULT 'PassPass',
    settlement_account  VARCHAR(64)   NULL,
    amount_minor        BIGINT       NOT NULL,
    fee_minor           BIGINT       NOT NULL DEFAULT 0,
    net_minor           BIGINT       NOT NULL,
    currency            CHAR(3)      NOT NULL DEFAULT 'MUR',
    status              ENUM('PENDING','PROCESSING','SETTLED','FAILED','RECONCILED') NOT NULL DEFAULT 'PENDING',
    provider_reference  VARCHAR(64)   NULL,
    settled_at          DATETIME      NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_settlement_reference (settlement_reference),
    KEY idx_settlement_merchant (merchant_id),
    KEY idx_settlement_batch (batch_id),
    CONSTRAINT fk_settlement_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
    CONSTRAINT fk_settlement_batch    FOREIGN KEY (batch_id)    REFERENCES settlement_batches (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- transactions (core ledger of attempts) ----------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_reference    VARCHAR(40)  NOT NULL,
    regulated_entity         VARCHAR(64)  NOT NULL DEFAULT 'PassPass',
    regulated_transaction_id VARCHAR(40)   NULL,             -- issued by PassPass
    regulated_merchant_id    VARCHAR(40)   NULL,
    merchant_id              BIGINT UNSIGNED  NULL,
    consumer_id              BIGINT UNSIGNED  NULL,
    payment_type             ENUM('BANK_TRANSFER','QR','PAYMENT_LINK','VIRTUAL_CREDENTIAL','PAYPUMP_TRANSFER','WORKFLOW','CARD') NOT NULL,
    amount_minor             BIGINT       NOT NULL,
    fee_minor                BIGINT       NOT NULL DEFAULT 0,
    net_minor                BIGINT       NOT NULL DEFAULT 0,
    currency                 CHAR(3)      NOT NULL DEFAULT 'MUR',
    status                   ENUM('CREATED','PENDING','PENDING_KYC','PENDING_PAYMENT','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','SETTLED','RECONCILED') NOT NULL DEFAULT 'CREATED',
    provider_name            VARCHAR(40)   NULL,
    provider_reference       VARCHAR(64)   NULL,
    merchant_reference       VARCHAR(64)   NULL,             -- merchant's own ref
    source                   VARCHAR(40)   NULL,             -- LINK, QR, API, PORTAL
    source_reference         VARCHAR(40)   NULL,
    settlement_id            BIGINT UNSIGNED  NULL,
    settlement_batch_id      VARCHAR(40)   NULL,
    reconciliation_status    ENUM('PENDING','MATCHED','EXCEPTION') NOT NULL DEFAULT 'PENDING',
    idempotency_key          VARCHAR(80)   NULL,
    metadata                 JSON          NULL,
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_txn_reference (transaction_reference),
    UNIQUE KEY uq_txn_regulated (regulated_transaction_id),
    UNIQUE KEY uq_txn_idempotency (idempotency_key),
    KEY idx_txn_merchant (merchant_id),
    KEY idx_txn_status (status),
    KEY idx_txn_type (payment_type),
    KEY idx_txn_provider (provider_name, provider_reference),
    KEY idx_txn_recon (reconciliation_status),
    KEY idx_txn_created (created_at),
    CONSTRAINT fk_txn_merchant   FOREIGN KEY (merchant_id)   REFERENCES merchants (id)   ON DELETE SET NULL,
    CONSTRAINT fk_txn_consumer   FOREIGN KEY (consumer_id)   REFERENCES consumers (id)   ON DELETE SET NULL,
    CONSTRAINT fk_txn_settlement FOREIGN KEY (settlement_id) REFERENCES settlements (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- transaction_events (immutable audit of state changes) -------------
CREATE TABLE IF NOT EXISTS transaction_events (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    from_status    VARCHAR(24)   NULL,
    to_status      VARCHAR(24)  NOT NULL,
    event_type     VARCHAR(40)  NOT NULL,         -- CREATE, PROVIDER_UPDATE, WEBHOOK, REFUND...
    provider_name  VARCHAR(40)   NULL,
    message        VARCHAR(255)  NULL,
    payload        JSON          NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_txnevt_txn (transaction_id),
    CONSTRAINT fk_txnevt_txn FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- payment_routes (admin-editable routing rules) ---------------------
CREATE TABLE IF NOT EXISTS payment_routes (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    payment_type  ENUM('BANK_TRANSFER','QR','PAYMENT_LINK','VIRTUAL_CREDENTIAL','PAYPUMP_TRANSFER','WORKFLOW','CARD') NOT NULL,
    provider_name VARCHAR(40)  NOT NULL,
    priority      INT          NOT NULL DEFAULT 100,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    conditions    JSON          NULL,            -- optional future routing predicates
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_route_type_provider (payment_type, provider_name),
    KEY idx_route_active (is_active, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- reconciliation ----------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_batches (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    batch_reference VARCHAR(40)  NOT NULL,
    source          ENUM('BANK_FILE','PROVIDER','MANUAL') NOT NULL DEFAULT 'PROVIDER',
    status          ENUM('OPEN','COMPLETED','FAILED') NOT NULL DEFAULT 'OPEN',
    period_start    DATETIME      NULL,
    period_end      DATETIME      NULL,
    total_items     INT UNSIGNED NOT NULL DEFAULT 0,
    matched_items   INT UNSIGNED NOT NULL DEFAULT 0,
    exception_items INT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reconbatch_reference (batch_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reconciliation_items (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recon_batch_id        BIGINT UNSIGNED NOT NULL,
    transaction_id        BIGINT UNSIGNED  NULL,
    settlement_id         BIGINT UNSIGNED  NULL,
    provider_reference    VARCHAR(64)   NULL,
    bank_reference        VARCHAR(64)   NULL,
    expected_amount_minor BIGINT        NULL,
    actual_amount_minor   BIGINT        NULL,
    status                ENUM('MATCHED','EXCEPTION') NOT NULL DEFAULT 'MATCHED',
    exception_type        ENUM('MISSING_SETTLEMENT','DUPLICATE_SETTLEMENT','AMOUNT_MISMATCH','REFERENCE_MISMATCH') NULL,
    notes                 VARCHAR(255)  NULL,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reconitem_batch (recon_batch_id),
    KEY idx_reconitem_status (status),
    CONSTRAINT fk_reconitem_batch      FOREIGN KEY (recon_batch_id) REFERENCES reconciliation_batches (id) ON DELETE CASCADE,
    CONSTRAINT fk_reconitem_txn        FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL,
    CONSTRAINT fk_reconitem_settlement FOREIGN KEY (settlement_id)  REFERENCES settlements (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- fees / fee_rules --------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_rules (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(120) NOT NULL,
    scope         ENUM('GLOBAL','MERCHANT') NOT NULL DEFAULT 'GLOBAL',
    merchant_id   BIGINT UNSIGNED  NULL,
    payment_type  ENUM('BANK_TRANSFER','QR','PAYMENT_LINK','VIRTUAL_CREDENTIAL','PAYPUMP_TRANSFER','WORKFLOW','CARD') NULL,
    percent_bps   INT UNSIGNED NOT NULL DEFAULT 0,   -- basis points (100 bps = 1%)
    fixed_minor   BIGINT       NOT NULL DEFAULT 0,
    min_minor     BIGINT        NULL,
    max_minor     BIGINT        NULL,
    currency      CHAR(3)      NOT NULL DEFAULT 'MUR',
    priority      INT          NOT NULL DEFAULT 100,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_feerule_scope (scope, is_active),
    KEY idx_feerule_merchant (merchant_id),
    CONSTRAINT fk_feerule_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fees (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    fee_rule_id    BIGINT UNSIGNED  NULL,
    amount_minor   BIGINT       NOT NULL,
    currency       CHAR(3)      NOT NULL DEFAULT 'MUR',
    type           VARCHAR(40)  NOT NULL DEFAULT 'PROCESSING',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fee_txn (transaction_id),
    CONSTRAINT fk_fee_txn      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
    CONSTRAINT fk_fee_feerule  FOREIGN KEY (fee_rule_id)    REFERENCES fee_rules (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- provider_configs (non-secret runtime config; secrets stay in ENV) --
CREATE TABLE IF NOT EXISTS provider_configs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_name VARCHAR(40)  NOT NULL,
    mode          ENUM('sandbox','live','stub') NOT NULL DEFAULT 'sandbox',
    is_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
    config        JSON          NULL,            -- non-secret settings only
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_providercfg_name (provider_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- api_keys (merchant API credentials) -------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id  BIGINT UNSIGNED NOT NULL,
    key_id       VARCHAR(40)  NOT NULL,            -- public identifier (pk_...)
    key_hash     VARCHAR(255) NOT NULL,            -- hash of the secret; never plaintext
    label        VARCHAR(120)  NULL,
    scopes       VARCHAR(255)  NULL,
    last_used_at DATETIME      NULL,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at   DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_apikey_keyid (key_id),
    KEY idx_apikey_merchant (merchant_id),
    CONSTRAINT fk_apikey_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- webhooks (inbound provider webhook log) ---------------------------
CREATE TABLE IF NOT EXISTS webhooks (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_name      VARCHAR(40)  NOT NULL,
    event_type         VARCHAR(80)   NULL,
    signature_verified TINYINT(1)   NOT NULL DEFAULT 0,
    payload            LONGTEXT      NULL,
    headers            JSON          NULL,
    processed          TINYINT(1)   NOT NULL DEFAULT 0,
    transaction_id     BIGINT UNSIGNED  NULL,
    received_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_webhook_provider (provider_name),
    KEY idx_webhook_processed (processed),
    CONSTRAINT fk_webhook_txn FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- audit_logs --------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id BIGINT UNSIGNED  NULL,
    actor_role    VARCHAR(40)   NULL,
    action        VARCHAR(80)  NOT NULL,
    entity_type   VARCHAR(60)   NULL,
    entity_id     VARCHAR(60)   NULL,
    ip_address    VARCHAR(45)   NULL,
    user_agent    VARCHAR(255)  NULL,
    before_state  JSON          NULL,
    after_state   JSON          NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_actor (actor_user_id),
    KEY idx_audit_entity (entity_type, entity_id),
    KEY idx_audit_created (created_at),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- notifications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED  NULL,
    channel    ENUM('IN_APP','EMAIL','SMS','WEBHOOK') NOT NULL DEFAULT 'IN_APP',
    type       VARCHAR(60)  NOT NULL,
    title      VARCHAR(160) NOT NULL,
    body       TEXT          NULL,
    is_read    TINYINT(1)   NOT NULL DEFAULT 0,
    metadata   JSON          NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notif_user (user_id, is_read),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- system_settings (key/value) --------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   VARCHAR(120) NOT NULL,
    setting_value TEXT          NULL,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
