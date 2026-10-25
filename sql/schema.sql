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
