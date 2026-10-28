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

-- =======================================================================
-- Module: bank reconciliation (MCB vs MIPS, e-commerce)
-- =======================================================================

-- ---- recon_mid_remaps: same merchant, two MIDs ---------------------------
-- Applied to both files before aggregating: from_mid is counted as to_mid.
CREATE TABLE IF NOT EXISTS recon_mid_remaps (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    from_mid        VARCHAR(32)  NOT NULL,
    to_mid          VARCHAR(32)  NOT NULL,
    label           VARCHAR(120) NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_recon_mid_remaps_from (from_mid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Known remaps (MCB recon procedure, 2026).
INSERT IGNORE INTO recon_mid_remaps (from_mid, to_mid, label) VALUES
    ('1010033540', '1010030300', 'Summertimes'),
    ('1010021980', '1010021981', 'Arcadia'),
    ('1010013888', '1010035580', 'Automatic Systems'),
    ('11346',      '33273',      'Vallée de Ferney'),
    ('1010021761', '1010021760', 'Bubble Lodge'),
    ('1010029891', '1030001080', 'Constance'),
    ('1010029900', '1030001070', 'Constance');

-- ---- recon_watch_mids: MIDs tracked in their own bucket, cumulatively ----
-- MIPS rows whose last_merchant_mid is listed here are absent from the MCB
-- file by construction; their gap is reported separately, not as a claim.
CREATE TABLE IF NOT EXISTS recon_watch_mids (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    mid             VARCHAR(32)  NOT NULL,
    label           VARCHAR(120) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_recon_watch_mids (mid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO recon_watch_mids (mid, label) VALUES
    ('1030001080', 'Constance new MID'),
    ('1030001070', 'Constance new MID');

-- ---- recon_runs ---------------------------------------------------------------
-- Source files are kept (storage.path/recon/) so a run can be recomputed
-- after a remap or watch-list change.
CREATE TABLE IF NOT EXISTS recon_runs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    period          CHAR(7)      NOT NULL,
    mcb_path        VARCHAR(255) NOT NULL,
    mcb_name        VARCHAR(255) NOT NULL,
    mcb_sha256      CHAR(64)     NOT NULL,
    mips_path       VARCHAR(255) NOT NULL,
    mips_name       VARCHAR(255) NOT NULL,
    mips_sha256     CHAR(64)     NOT NULL,
    summary         JSON         NULL,      -- per-currency totals, categories, % views
    warnings        JSON         NULL,      -- scope / window / sentinel checks
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    computed_at     DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_recon_runs_period (period, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- recon_lines: one per (MID, currency), gap split into categories -------
-- Invariant: amt_card_verif + amt_clearing + amt_watch + amt_mips_only
--            + amt_mcb_only + amt_real = diff  (diff = MCB - MIPS)
CREATE TABLE IF NOT EXISTS recon_lines (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    run_id          BIGINT UNSIGNED NOT NULL,
    mid             VARCHAR(32)   NOT NULL,
    merchant_name   VARCHAR(255)  NULL,
    merchant_id     BIGINT UNSIGNED NULL,
    currency        VARCHAR(8)    NOT NULL,
    mcb_amount      DECIMAL(18,2) NOT NULL DEFAULT 0,
    mips_amount     DECIMAL(18,2) NOT NULL DEFAULT 0,
    mips_count      INT UNSIGNED  NOT NULL DEFAULT 0,
    mips_zero_count INT UNSIGNED  NOT NULL DEFAULT 0,
    is_bundled      TINYINT(1)    NOT NULL DEFAULT 0,
    diff            DECIMAL(18,2) NOT NULL DEFAULT 0,
    amt_card_verif  DECIMAL(18,2) NOT NULL DEFAULT 0,
    amt_clearing    DECIMAL(18,2) NOT NULL DEFAULT 0,
    amt_watch       DECIMAL(18,2) NOT NULL DEFAULT 0,
    amt_mips_only   DECIMAL(18,2) NOT NULL DEFAULT 0,
    amt_mcb_only    DECIMAL(18,2) NOT NULL DEFAULT 0,
    amt_real        DECIMAL(18,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_recon_lines_run (run_id, currency),
    CONSTRAINT fk_recon_lines_run FOREIGN KEY (run_id) REFERENCES recon_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recon_daily (
    line_id         BIGINT UNSIGNED NOT NULL,
    day             DATE          NOT NULL,
    mcb_amount      DECIMAL(18,2) NOT NULL DEFAULT 0,
    mips_amount     DECIMAL(18,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (line_id, day),
    CONSTRAINT fk_recon_daily_line FOREIGN KEY (line_id) REFERENCES recon_lines (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- recon_claim_items: MIPS transactions on days MCB is short -------------
-- Candidates for the claim to MCB, not a proven subset.
CREATE TABLE IF NOT EXISTS recon_claim_items (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    line_id         BIGINT UNSIGNED NOT NULL,
    txn_at          VARCHAR(32)   NULL,
    reference       VARCHAR(128)  NULL,
    network         VARCHAR(32)   NULL,
    amount          DECIMAL(18,2) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_recon_claim_items_line (line_id),
    CONSTRAINT fk_recon_claim_items_line FOREIGN KEY (line_id) REFERENCES recon_lines (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================================================
-- Module: merchant onboarding & KYC
-- Document checklist is defined in config 'kyc.requirements'.
-- =======================================================================

CREATE TABLE IF NOT EXISTS onboarding_cases (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id       BIGINT UNSIGNED NOT NULL,
    kind              ENUM('initial','periodic_review') NOT NULL DEFAULT 'initial',
    status            ENUM('collecting','under_review','on_hold','approved','rejected') NOT NULL DEFAULT 'collecting',
    risk_rating       ENUM('low','medium','high') NULL,
    assigned_to       BIGINT UNSIGNED NULL,      -- analyst; the approver must be someone else
    due_date          DATE         NULL,
    notes             TEXT         NULL,
    submitted_at      DATETIME     NULL,
    decided_at        DATETIME     NULL,
    decided_by        BIGINT UNSIGNED NULL,
    decision_notes    TEXT         NULL,
    next_review_date  DATE         NULL,          -- set on approval from the risk rating
    created_by        BIGINT UNSIGNED NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_onboarding_cases_merchant (merchant_id),
    KEY idx_onboarding_cases_status (status),
    CONSTRAINT fk_onboarding_cases_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- kyc_parties: directors, beneficial owners, signatories ----------------
-- id_number is encrypted with the application key (personal data).
CREATE TABLE IF NOT EXISTS kyc_parties (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    case_id               BIGINT UNSIGNED NOT NULL,
    full_name             VARCHAR(160) NOT NULL,
    roles                 SET('director','ubo','signatory','shareholder') NOT NULL,
    ownership_pct         DECIMAL(5,2) NULL,
    nationality           VARCHAR(60)  NULL,
    date_of_birth         DATE         NULL,
    id_number_enc         VARBINARY(255) NULL,
    is_pep                TINYINT(1)   NOT NULL DEFAULT 0,
    screening_result      ENUM('pending','clear','match') NOT NULL DEFAULT 'pending',
    screening_reference   VARCHAR(120) NULL,     -- e.g. screening tool case number
    screened_at           DATE         NULL,
    notes                 VARCHAR(500) NULL,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kyc_parties_case (case_id),
    CONSTRAINT fk_kyc_parties_case FOREIGN KEY (case_id) REFERENCES onboarding_cases (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- kyc_documents --------------------------------------------------------------
-- Files live outside the web root (storage.path/kyc/). Every upload is kept:
-- a rejected or replaced document stays on record for audit.
CREATE TABLE IF NOT EXISTS kyc_documents (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    case_id           BIGINT UNSIGNED NOT NULL,
    requirement       VARCHAR(40)  NOT NULL,
    party_id          BIGINT UNSIGNED NULL,
    path              VARCHAR(255) NOT NULL,
    original_name     VARCHAR(255) NOT NULL,
    mime              VARCHAR(64)  NOT NULL,
    size              INT UNSIGNED NOT NULL,
    sha256            CHAR(64)     NOT NULL,
    expires_at        DATE         NULL,
    status            ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    uploaded_by       BIGINT UNSIGNED NULL,
    uploaded_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by       BIGINT UNSIGNED NULL,      -- must differ from uploaded_by (four eyes)
    reviewed_at       DATETIME     NULL,
    rejection_reason  VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_kyc_documents_case (case_id, requirement),
    CONSTRAINT fk_kyc_documents_case FOREIGN KEY (case_id) REFERENCES onboarding_cases (id),
    CONSTRAINT fk_kyc_documents_party FOREIGN KEY (party_id) REFERENCES kyc_parties (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kyc_reminders (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    case_id         BIGINT UNSIGNED NOT NULL,
    sent_to         VARCHAR(254) NOT NULL,
    items           JSON         NULL,
    sent_by         BIGINT UNSIGNED NULL,       -- NULL = scheduled job
    delivered       TINYINT(1)   NOT NULL DEFAULT 0,
    sent_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kyc_reminders_case (case_id, sent_at),
    CONSTRAINT fk_kyc_reminders_case FOREIGN KEY (case_id) REFERENCES onboarding_cases (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================================================
-- Module: merchant portal (phase 2)
-- Merchant accounts are kept apart from staff accounts (own table, own
-- session cookie). A merchant only ever reaches the onboarding case opened
-- from its own application (prequalifications.case_id).
-- =======================================================================

CREATE TABLE IF NOT EXISTS portal_users (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email               VARCHAR(254) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    password_changed_at DATETIME     NULL,
    name                VARCHAR(120) NOT NULL,
    phone               VARCHAR(40)  NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,     -- staff can switch an account off
    email_verified_at   DATETIME     NULL,                   -- no sign-in before the address is confirmed
    totp_secret         VARBINARY(255) NULL,                 -- encrypted with security.app_key
    totp_enabled_at     DATETIME     NULL,
    totp_last_step      BIGINT       NULL,
    last_login_at       DATETIME     NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_portal_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_recovery_codes (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    portal_user_id  BIGINT UNSIGNED NOT NULL,
    code_hash       CHAR(64)     NOT NULL,
    used_at         DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_portal_recovery_codes (portal_user_id, code_hash),
    CONSTRAINT fk_portal_recovery_codes_user FOREIGN KEY (portal_user_id) REFERENCES portal_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email verification and password reset links. Only sha256(token) is stored.
CREATE TABLE IF NOT EXISTS portal_tokens (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    portal_user_id  BIGINT UNSIGNED NOT NULL,
    purpose         ENUM('verify','reset') NOT NULL,
    token_hash      CHAR(64)     NOT NULL,
    expires_at      DATETIME     NOT NULL,
    used_at         DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_portal_tokens_hash (token_hash),
    KEY idx_portal_tokens_user (portal_user_id, purpose),
    CONSTRAINT fk_portal_tokens_user FOREIGN KEY (portal_user_id) REFERENCES portal_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Terms of use shown to merchants. A published version is never edited:
-- a change is a new version, which every merchant must accept again.
CREATE TABLE IF NOT EXISTS terms_versions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    version         VARCHAR(20)  NOT NULL,
    title           VARCHAR(200) NOT NULL,
    body            MEDIUMTEXT   NOT NULL,                   -- plain text, shown as is
    body_sha256     CHAR(64)     NOT NULL,
    published_by    BIGINT UNSIGNED NULL,
    published_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_terms_versions_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Consent log: who accepted which text (its hash), when, from where.
CREATE TABLE IF NOT EXISTS terms_acceptances (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    portal_user_id    BIGINT UNSIGNED NOT NULL,
    terms_version_id  BIGINT UNSIGNED NOT NULL,
    body_sha256       CHAR(64)     NOT NULL,
    accepted_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address        VARCHAR(45)  NULL,
    user_agent        VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_terms_acceptances (portal_user_id, terms_version_id),
    CONSTRAINT fk_terms_acceptances_user FOREIGN KEY (portal_user_id) REFERENCES portal_users (id),
    CONSTRAINT fk_terms_acceptances_version FOREIGN KEY (terms_version_id) REFERENCES terms_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pre-qualification filled in by the prospect. Staff accept it (which
-- creates or links the merchant and opens the onboarding case) or decline it.
-- 'flags' are computed for the analyst only and never shown to the merchant.
CREATE TABLE IF NOT EXISTS prequalifications (
    id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    portal_user_id           BIGINT UNSIGNED NOT NULL,
    status                   ENUM('submitted','accepted','declined') NOT NULL DEFAULT 'submitted',
    legal_name               VARCHAR(255) NOT NULL,
    trading_name             VARCHAR(255) NOT NULL,
    brn                      VARCHAR(32)  NOT NULL,
    vat_number               VARCHAR(32)  NULL,
    country_of_incorporation VARCHAR(60)  NOT NULL,
    registered_address       TEXT         NOT NULL,
    sector                   VARCHAR(40)  NOT NULL,
    products_services        TEXT         NOT NULL,
    website                  VARCHAR(255) NULL,
    countries_of_operation   VARCHAR(255) NOT NULL,
    monthly_volume_band      VARCHAR(20)  NOT NULL,
    average_ticket_mur       DECIMAL(12,2) NOT NULL,
    payment_methods          SET('card','qr','push','ecommerce','pos') NOT NULL,
    contact_name             VARCHAR(120) NOT NULL,
    contact_role             VARCHAR(120) NULL,
    contact_phone            VARCHAR(40)  NOT NULL,
    is_regulated             TINYINT(1)   NOT NULL DEFAULT 0,
    regulator                VARCHAR(120) NULL,
    flags                    JSON         NULL,
    submitted_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_by               BIGINT UNSIGNED NULL,
    decided_at               DATETIME     NULL,
    decision_note            VARCHAR(1000) NULL,          -- internal
    merchant_id              BIGINT UNSIGNED NULL,
    case_id                  BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_prequalifications_status (status, submitted_at),
    KEY idx_prequalifications_user (portal_user_id),
    CONSTRAINT fk_prequalifications_user FOREIGN KEY (portal_user_id) REFERENCES portal_users (id),
    CONSTRAINT fk_prequalifications_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id),
    CONSTRAINT fk_prequalifications_case FOREIGN KEY (case_id) REFERENCES onboarding_cases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documents and people the merchant provided itself through the portal.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS uploaded_by_portal BIGINT UNSIGNED NULL AFTER uploaded_by;
-- 'clean' = passed the antivirus; 'not_scanned' = no scanner configured.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS scan_status ENUM('clean','not_scanned') NULL AFTER sha256;
ALTER TABLE kyc_parties ADD COLUMN IF NOT EXISTS declared_by_portal BIGINT UNSIGNED NULL AFTER notes;
-- Set when the merchant tells MIPS its file is complete; cleared when the
-- case goes back to collecting.
ALTER TABLE onboarding_cases ADD COLUMN IF NOT EXISTS merchant_submitted_at DATETIME NULL AFTER submitted_at;
