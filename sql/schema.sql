-- -----------------------------------------------------------------------
-- MIPS Platform — database schema (MariaDB / MySQL)
--
-- Usage:
--   mysql -u root -p < sql/schema.sql
-- -----------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS mips_platform
    CHARACTER SET utf8mb4
    COLLATE       utf8mb4_unicode_ci;

USE mips_platform;

-- ---- users -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email           VARCHAR(254) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(120) NULL,
    role            VARCHAR(32)  NOT NULL DEFAULT 'user',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Distinguishes "pending" (never activated) from "deactivated" accounts.
-- Idempotent for databases created before the column existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at DATETIME NULL AFTER is_active;
UPDATE users SET activated_at = created_at WHERE is_active = 1 AND activated_at IS NULL;

-- Password changes invalidate every other session (see Auth::current_user).
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at DATETIME NULL AFTER password_hash;

-- Two-factor authentication (TOTP). The secret is encrypted with the
-- application key (config security.app_key); totp_last_step blocks code replay.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret     VARBINARY(255) NULL AFTER role;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at DATETIME       NULL AFTER totp_secret;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step  BIGINT         NULL AFTER totp_enabled_at;

-- ---- recovery_codes (single-use 2FA fallback) ----------------------------
CREATE TABLE IF NOT EXISTS recovery_codes (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         BIGINT UNSIGNED NOT NULL,
    code_hash       CHAR(64)     NOT NULL,   -- sha256 of the normalised code
    used_at         DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_recovery_codes_hash (user_id, code_hash),
    CONSTRAINT fk_recovery_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- password_resets ----------------------------------------------------
-- Only the sha256 of the token is stored; the token itself is in the link.
CREATE TABLE IF NOT EXISTS password_resets (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         BIGINT UNSIGNED NOT NULL,
    token_hash      CHAR(64)     NOT NULL,
    expires_at      DATETIME     NOT NULL,
    used_at         DATETIME     NULL,
    created_by      BIGINT UNSIGNED NULL,     -- admin who generated the link; NULL = self-service
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_password_resets_token (token_hash),
    KEY idx_password_resets_user (user_id),
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- login_attempts (rate limiting) ------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip_address      VARCHAR(45)  NOT NULL,   -- supports IPv6
    email           VARCHAR(254) NOT NULL,
    success         TINYINT(1)   NOT NULL DEFAULT 0,
    attempted_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_login_attempts_ip_time    (ip_address, attempted_at),
    KEY idx_login_attempts_email_time (email,      attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: a dedicated application user rather than root.
-- CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
-- FLUSH PRIVILEGES;

-- =======================================================================
-- Module: audit log
-- Append-only. In production, grant the application user INSERT + SELECT
-- only on this table so that history cannot be rewritten from the app:
--   REVOKE UPDATE, DELETE ON mips_platform.audit_log FROM 'mips_user'@'localhost';
-- (requires table-level grants instead of the schema-wide GRANT above)
-- =======================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         BIGINT UNSIGNED NULL,     -- NULL for anonymous actions (failed login, register)
    user_email      VARCHAR(254) NULL,        -- denormalised: survives user deletion / email change
    action          VARCHAR(64)  NOT NULL,    -- e.g. auth.login, import.create, invoice.issue
    entity_type     VARCHAR(32)  NULL,
    entity_id       VARCHAR(64)  NULL,
    details         JSON         NULL,
    ip_address      VARCHAR(45)  NULL,
    user_agent      VARCHAR(255) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created   (created_at),
    KEY idx_audit_user      (user_id, created_at),
    KEY idx_audit_action    (action, created_at),
    KEY idx_audit_entity    (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================================================
-- Module: monthly reporting (Commission_Data imports)
-- =======================================================================

-- ---- merchants ----------------------------------------------------------
-- Merchant key is the Commission_Data `form_name` (fallback `form_nickname`).
CREATE TABLE IF NOT EXISTS merchants (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(255) NOT NULL,
    billing_email   VARCHAR(254) NULL,
    is_billable     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchants_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Merchant profile (module: merchants). `name` stays the import key
-- (Commission_Data form_name); the profile adds the legal identity.
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS legal_name         VARCHAR(255) NULL AFTER name;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS status             ENUM('prospect','onboarding','active','suspended','terminated') NOT NULL DEFAULT 'active' AFTER legal_name;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS brn                VARCHAR(32)  NULL AFTER status;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS vat_number         VARCHAR(32)  NULL AFTER brn;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS address            TEXT         NULL AFTER vat_number;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS sector             VARCHAR(100) NULL AFTER address;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS account_manager_id BIGINT UNSIGNED NULL AFTER sector;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS notes              TEXT         NULL AFTER is_billable;
ALTER TABLE merchants ADD KEY IF NOT EXISTS idx_merchants_status (status);

-- ---- merchant_contacts ----------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_contacts (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id     BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(120) NOT NULL,
    job_title       VARCHAR(120) NULL,
    email           VARCHAR(254) NULL,
    phone           VARCHAR(40)  NULL,
    is_primary      TINYINT(1)   NOT NULL DEFAULT 0,
    is_billing      TINYINT(1)   NOT NULL DEFAULT 0,
    notes           VARCHAR(500) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_merchant_contacts_merchant (merchant_id),
    CONSTRAINT fk_merchant_contacts_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- merchant_identifiers (MIDs, QR TUIs... used by bank reconciliations) --
CREATE TABLE IF NOT EXISTS merchant_identifiers (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id     BIGINT UNSIGNED NOT NULL,
    type            ENUM('MID','TUI','OUTLET','OTHER') NOT NULL,
    value           VARCHAR(64)  NOT NULL,
    label           VARCHAR(120) NULL,          -- e.g. acquiring bank, "old MID"
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_identifiers (type, value),
    KEY idx_merchant_identifiers_merchant (merchant_id),
    CONSTRAINT fk_merchant_identifiers_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- contracts ----------------------------------------------------------------
-- Documents are stored outside the web root (config storage.path) and served
-- only through an authenticated endpoint.
CREATE TABLE IF NOT EXISTS contracts (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id         BIGINT UNSIGNED NOT NULL,
    reference           VARCHAR(64)  NULL,
    type                ENUM('MSA','PRICING','ADDENDUM','NDA','OTHER') NOT NULL DEFAULT 'MSA',
    status              ENUM('draft','signed','terminated') NOT NULL DEFAULT 'draft',
    signed_at           DATE         NULL,
    start_date          DATE         NULL,
    end_date            DATE         NULL,           -- NULL = open-ended
    auto_renew          TINYINT(1)   NOT NULL DEFAULT 0,
    notice_days         SMALLINT UNSIGNED NULL,      -- notice needed before end_date to terminate / renegotiate
    notes               TEXT         NULL,
    document_path       VARCHAR(255) NULL,           -- relative to storage.path
    document_name       VARCHAR(255) NULL,           -- original filename, for download
    document_sha256     CHAR(64)     NULL,
    document_size       INT UNSIGNED NULL,
    created_by          BIGINT UNSIGNED NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contracts_merchant (merchant_id),
    KEY idx_contracts_end (status, end_date),
    CONSTRAINT fk_contracts_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- imports (one row per uploaded file) --------------------------------
CREATE TABLE IF NOT EXISTS imports (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    filename        VARCHAR(255) NOT NULL,
    file_sha256     CHAR(64)     NOT NULL,
    imported_by     BIGINT UNSIGNED NULL,
    rows_raw        INT UNSIGNED NOT NULL DEFAULT 0,
    rows_clean      INT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_imports_sha (file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- import_periods (cleaning stats per month, latest import wins) ------
CREATE TABLE IF NOT EXISTS import_periods (
    period                  CHAR(7)       NOT NULL,   -- YYYY-MM
    import_id               BIGINT UNSIGNED NOT NULL,
    rows_raw                INT UNSIGNED  NOT NULL DEFAULT 0,
    rows_not_success        INT UNSIGNED  NOT NULL DEFAULT 0,
    rows_test               INT UNSIGNED  NOT NULL DEFAULT 0,
    rows_refund_only        INT UNSIGNED  NOT NULL DEFAULT 0,
    refund_total_reported   DECIMAL(18,2) NOT NULL DEFAULT 0,
    rows_clean              INT UNSIGNED  NOT NULL DEFAULT 0,
    PRIMARY KEY (period),
    KEY idx_import_periods_import (import_id),
    CONSTRAINT fk_import_periods_import FOREIGN KEY (import_id) REFERENCES imports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- transactions (clean rows only, frozen cleaning rules applied) ------
CREATE TABLE IF NOT EXISTS transactions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    import_id           BIGINT UNSIGNED NOT NULL,
    period              CHAR(7)       NOT NULL,
    txn_date            DATE          NOT NULL,
    merchant_id         BIGINT UNSIGNED NOT NULL,
    sof_proc_nickname   VARCHAR(64)   NOT NULL DEFAULT '',
    rail_type           ENUM('CARD','QR','PUSH','OTHER') NOT NULL,
    channel             ENUM('TPE','ONLINE') NOT NULL,
    fi_name             VARCHAR(64)   NOT NULL DEFAULT '',
    currency            VARCHAR(8)    NOT NULL,
    amount              DECIMAL(18,2) NOT NULL,
    refund_amount       DECIMAL(18,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_txn_period          (period, merchant_id),
    KEY idx_txn_period_rail     (period, sof_proc_nickname),
    CONSTRAINT fk_txn_import   FOREIGN KEY (import_id)   REFERENCES imports (id),
    CONSTRAINT fk_txn_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================================================
-- Module: commission billing
-- =======================================================================

-- ---- fee_rules ------------------------------------------------------------
-- NULL in merchant_id / sof_proc_nickname / rail_type / channel = "any".
-- The most specific matching rule wins (see App\Billing\FeeRules).
-- Fee on a transaction = amount * rate_pct / 100 + fixed_fee.
CREATE TABLE IF NOT EXISTS fee_rules (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id         BIGINT UNSIGNED NULL,
    sof_proc_nickname   VARCHAR(64)   NULL,
    rail_type           ENUM('CARD','QR','PUSH','OTHER') NULL,
    channel             ENUM('TPE','ONLINE') NULL,
    rate_pct            DECIMAL(7,4)  NOT NULL DEFAULT 0,
    fixed_fee           DECIMAL(12,2) NOT NULL DEFAULT 0,
    valid_from          DATE          NOT NULL,
    valid_to            DATE          NULL,
    is_active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_by          BIGINT UNSIGNED NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fee_rules_merchant (merchant_id),
    CONSTRAINT fk_fee_rules_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- invoices ---------------------------------------------------------------
-- One invoice per merchant / period / currency. Drafts have no number; the
-- number is assigned from invoice_sequences when the invoice is issued, so
-- issued numbers are sequential with no gaps.
CREATE TABLE IF NOT EXISTS invoices (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    number          VARCHAR(32)   NULL,
    merchant_id     BIGINT UNSIGNED NOT NULL,
    period          CHAR(7)       NOT NULL,
    currency        VARCHAR(8)    NOT NULL,
    status          ENUM('draft','issued','paid','void') NOT NULL DEFAULT 'draft',
    txn_count       INT UNSIGNED  NOT NULL DEFAULT 0,
    volume          DECIMAL(18,2) NOT NULL DEFAULT 0,
    subtotal        DECIMAL(18,2) NOT NULL DEFAULT 0,
    vat_rate        DECIMAL(5,2)  NOT NULL DEFAULT 0,
    vat_amount      DECIMAL(18,2) NOT NULL DEFAULT 0,
    total           DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Non-NULL while the invoice is not void: enforces one live invoice
    -- per merchant/period/currency while allowing any number of voided ones.
    live_key        TINYINT(1)    NULL DEFAULT 1,
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_at       DATETIME      NULL,
    paid_at         DATETIME      NULL,
    voided_at       DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_invoices_number (number),
    UNIQUE KEY uq_invoices_live   (merchant_id, period, currency, live_key),
    KEY idx_invoices_period (period, status),
    CONSTRAINT fk_invoices_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_lines (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    invoice_id          BIGINT UNSIGNED NOT NULL,
    sof_proc_nickname   VARCHAR(64)   NOT NULL,
    channel             ENUM('TPE','ONLINE') NOT NULL,
    fee_rule_id         BIGINT UNSIGNED NULL,     -- NULL = no matching rule (fee 0, flagged)
    rate_pct            DECIMAL(7,4)  NOT NULL DEFAULT 0,
    fixed_fee           DECIMAL(12,2) NOT NULL DEFAULT 0,
    txn_count           INT UNSIGNED  NOT NULL DEFAULT 0,
    volume              DECIMAL(18,2) NOT NULL DEFAULT 0,
    amount              DECIMAL(18,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_invoice_lines_invoice (invoice_id),
    CONSTRAINT fk_invoice_lines_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_sequences (
    year            SMALLINT UNSIGNED NOT NULL,
    last_value      INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
