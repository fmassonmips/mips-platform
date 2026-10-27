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

-- ---- organizations (tenants: each client company) --------------------
CREATE TABLE IF NOT EXISTS organizations (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(160) NOT NULL,
    -- Company profile, printed on documents (quotes, invoices, ...)
    legal_name      VARCHAR(200) NULL,
    address         VARCHAR(500) NULL,
    brn             VARCHAR(40)  NULL,
    vat_number      VARCHAR(40)  NULL,
    email           VARCHAR(254) NULL,
    phone           VARCHAR(40)  NULL,
    -- Language of documents sent to clients (quotes, invoices, credit notes, e-mails)
    document_language CHAR(2)    NOT NULL DEFAULT 'fr',
    -- MRA e-invoicing credentials (password encrypted with app.secret_key)
    mra_enabled      TINYINT(1)   NOT NULL DEFAULT 0,
    mra_username     VARCHAR(100) NULL,
    mra_password_enc TEXT         NULL,
    mra_ebs_id       VARCHAR(50)  NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- organization_users (membership + role inside the tenant) ----------
CREATE TABLE IF NOT EXISTS organization_users (
    organization_id BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    role            VARCHAR(32)  NOT NULL DEFAULT 'member',  -- owner | admin | member
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, user_id),
    KEY idx_org_users_user (user_id),
    CONSTRAINT fk_org_users_org  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_org_users_user FOREIGN KEY (user_id)         REFERENCES users (id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- organization_modules (which suite apps a tenant has switched on) --
-- The module catalog itself lives in code (src/Suite/Catalog.php).
CREATE TABLE IF NOT EXISTS organization_modules (
    organization_id BIGINT UNSIGNED NOT NULL,
    module_slug     VARCHAR(40)  NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'trial',  -- trial | active | disabled
    activated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trial_ends_at   DATETIME     NULL,
    PRIMARY KEY (organization_id, module_slug),
    CONSTRAINT fk_org_modules_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================================================
-- Facturo — quotes & invoices
-- =======================================================================

-- ---- facturo_clients ----------------------------------------------------
CREATE TABLE IF NOT EXISTS facturo_clients (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(200) NOT NULL,
    email           VARCHAR(254) NULL,
    phone           VARCHAR(40)  NULL,
    address         VARCHAR(500) NULL,
    brn             VARCHAR(40)  NULL,
    vat_number      VARCHAR(40)  NULL,
    document_language CHAR(2)    NULL,                      -- fr | en; NULL = the company's language
    clientbloom_customer_id BIGINT UNSIGNED NULL,           -- loyalty customer (FK added after clientbloom tables)
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_facturo_clients_org_name (organization_id, name),
    CONSTRAINT fk_facturo_clients_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- facturo_documents (quotes and invoices) ------------------------------
-- Amounts are stored in cents. Drafts have no number; a number is assigned
-- when the document is issued, after which it can no longer be edited.
-- *_snapshot freeze seller and client details as they were at issue time.
CREATE TABLE IF NOT EXISTS facturo_documents (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id    BIGINT UNSIGNED NOT NULL,
    type               VARCHAR(16)  NOT NULL,               -- quote | invoice | credit_note
    number             VARCHAR(32)  NULL,
    status             VARCHAR(16)  NOT NULL DEFAULT 'draft',
    client_id          BIGINT UNSIGNED NOT NULL,
    issue_date         DATE         NOT NULL,
    due_date           DATE         NULL,                   -- invoice: due; quote: valid until
    currency           CHAR(3)      NOT NULL DEFAULT 'MUR',
    notes              TEXT         NULL,
    subtotal_cents     BIGINT       NOT NULL DEFAULT 0,
    tax_cents          BIGINT       NOT NULL DEFAULT 0,
    total_cents        BIGINT       NOT NULL DEFAULT 0,
    source_document_id BIGINT UNSIGNED NULL,               -- quote of an invoice; invoice of a credit note
    seller_snapshot    TEXT         NULL,
    client_snapshot    TEXT         NULL,
    language           CHAR(2)      NULL,          -- fr | en, frozen at issue
    public_token       VARCHAR(64)  NULL,                   -- unguessable link sent to the client
    -- MRA fiscalisation (invoices and credit notes of organizations with e-invoicing on)
    mra_status         VARCHAR(16)  NULL,                   -- pending | fiscalised | rejected
    mra_counter        INT UNSIGNED NULL,                   -- EBS invoice counter, never reset
    mra_irn            VARCHAR(100) NULL,                   -- identifier returned by MRA
    mra_qr             MEDIUMTEXT   NULL,                   -- base64 PNG returned by MRA
    mra_error          VARCHAR(1000) NULL,
    mra_attempts       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    mra_fiscalised_at  DATETIME     NULL,
    clientbloom_tx_id  BIGINT UNSIGNED NULL,                -- ClientBloom purchase recorded when paid
    clientbloom_note   VARCHAR(255) NULL,                   -- last loyalty outcome shown on the invoice
    issued_at          DATETIME     NULL,
    paid_at            DATETIME     NULL,
    created_by         BIGINT UNSIGNED NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_facturo_documents_number (organization_id, type, number),
    UNIQUE KEY uq_facturo_documents_public_token (public_token),
    KEY idx_facturo_documents_org_type (organization_id, type, created_at),
    KEY idx_facturo_documents_mra (organization_id, mra_status, mra_counter),
    CONSTRAINT fk_facturo_documents_org    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_facturo_documents_client FOREIGN KEY (client_id)       REFERENCES facturo_clients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- facturo_document_lines ---------------------------------------------
CREATE TABLE IF NOT EXISTS facturo_document_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    document_id      BIGINT UNSIGNED NOT NULL,
    position         SMALLINT UNSIGNED NOT NULL,
    description      VARCHAR(500)  NOT NULL,
    quantity         DECIMAL(12,3) NOT NULL,
    unit_price_cents BIGINT        NOT NULL,
    tax_rate         DECIMAL(5,2)  NOT NULL DEFAULT 0,
    tax_code         VARCHAR(4)    NULL,                    -- MRA: TC01 15% | TC02 zero-rated | TC03 exempt
    nature           VARCHAR(8)    NULL,                    -- MRA: GOODS | SERVICES
    line_total_cents BIGINT        NOT NULL,                -- excl. tax
    line_tax_cents   BIGINT        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_facturo_lines_doc (document_id, position),
    CONSTRAINT fk_facturo_lines_doc FOREIGN KEY (document_id) REFERENCES facturo_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- facturo_sequences (gap-free numbering per org, type and year) ------
CREATE TABLE IF NOT EXISTS facturo_sequences (
    organization_id BIGINT UNSIGNED NOT NULL,
    type            VARCHAR(16)  NOT NULL,
    year            SMALLINT UNSIGNED NOT NULL,
    last_value      INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (organization_id, type, year),
    CONSTRAINT fk_facturo_sequences_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- facturo_document_emails (send log) --------------------------------
CREATE TABLE IF NOT EXISTS facturo_document_emails (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    document_id     BIGINT UNSIGNED NOT NULL,
    recipient       VARCHAR(254) NOT NULL,
    subject         VARCHAR(250) NOT NULL,
    status          VARCHAR(16)  NOT NULL,                  -- sent | failed
    error           VARCHAR(500) NULL,
    sent_by         BIGINT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_facturo_emails_doc (document_id, created_at),
    CONSTRAINT fk_facturo_emails_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_facturo_emails_doc FOREIGN KEY (document_id)     REFERENCES facturo_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- mra_tokens (cached MRA authentication per organization) -----------
CREATE TABLE IF NOT EXISTS mra_tokens (
    organization_id BIGINT UNSIGNED NOT NULL,
    token           VARCHAR(1000) NOT NULL,
    session_key_enc TEXT          NOT NULL,                 -- AES key returned by MRA, encrypted at rest
    expires_at      DATETIME      NOT NULL,
    PRIMARY KEY (organization_id),
    CONSTRAINT fk_mra_tokens_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================================================
-- ClientBloom — CRM & loyalty (closed-loop cashback)
-- =======================================================================

-- ---- clientbloom_settings (loyalty program rules, one row per org) -----
CREATE TABLE IF NOT EXISTS clientbloom_settings (
    organization_id     BIGINT UNSIGNED NOT NULL,
    cashback_bp         INT UNSIGNED NOT NULL DEFAULT 500,     -- 5.00 % of the amount paid
    min_redeem_cents    BIGINT       NOT NULL DEFAULT 10000,   -- smallest amount a customer can use
    welcome_bonus_cents BIGINT       NOT NULL DEFAULT 0,
    expiry_months       SMALLINT UNSIGNED NOT NULL DEFAULT 12, -- balance lost after N months without activity; 0 = never
    facturo_rewards     TINYINT(1)   NOT NULL DEFAULT 0,       -- paid Facturo invoices earn cashback
    invoice_cashback_bp INT UNSIGNED NOT NULL DEFAULT 100,     -- 1.00 % on paid invoices (counter rate is separate)
    invoice_cap_cents   BIGINT       NOT NULL DEFAULT 0,       -- max cashback per invoice; 0 = no cap
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

-- ---- Facturo ↔ ClientBloom link ------------------------------------------
ALTER TABLE facturo_clients
    ADD CONSTRAINT fk_facturo_clients_cb FOREIGN KEY (clientbloom_customer_id)
        REFERENCES clientbloom_customers (id) ON DELETE SET NULL;

-- ---- rendezvous_settings (online booking rules, one row per org) --------
CREATE TABLE IF NOT EXISTS rendezvous_settings (
    organization_id   BIGINT UNSIGNED  NOT NULL,
    public_token      CHAR(32)         NOT NULL,                -- booking page link /rendezvous/book.php?o=…
    booking_enabled   TINYINT(1)       NOT NULL DEFAULT 1,
    slot_step_min     SMALLINT UNSIGNED NOT NULL DEFAULT 15,    -- start times offered every N minutes
    min_notice_min    INT UNSIGNED     NOT NULL DEFAULT 60,     -- earliest online booking from now
    max_days_ahead    SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    cancel_notice_min INT UNSIGNED     NOT NULL DEFAULT 120,    -- latest online cancellation before start
    notify_email      VARCHAR(254)     NULL,                    -- copy of every online booking / cancellation
    intro             VARCHAR(500)     NULL,                    -- text shown on the booking page
    survey_form_id    BIGINT UNSIGNED  NULL,                    -- Formelio survey sent after an honoured appointment
    updated_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id),
    UNIQUE KEY uq_rv_settings_token (public_token),
    CONSTRAINT fk_rv_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_services (what can be booked) ---------------------------
CREATE TABLE IF NOT EXISTS rendezvous_services (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED  NOT NULL,
    name            VARCHAR(120)     NOT NULL,
    duration_min    SMALLINT UNSIGNED NOT NULL,
    price_cents     BIGINT           NULL,                      -- shown on the booking page, MUR
    active          TINYINT(1)       NOT NULL DEFAULT 1,
    created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rv_services_org (organization_id, name),
    CONSTRAINT fk_rv_services_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_staff (people or resources with their own agenda) -------
CREATE TABLE IF NOT EXISTS rendezvous_staff (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(120)    NOT NULL,
    active          TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rv_staff_org (organization_id, name),
    CONSTRAINT fk_rv_staff_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_hours (weekly working hours, several ranges per day) ----
CREATE TABLE IF NOT EXISTS rendezvous_hours (
    staff_id   BIGINT UNSIGNED  NOT NULL,
    weekday    TINYINT UNSIGNED NOT NULL,                       -- 1 = Monday … 7 = Sunday
    start_time TIME             NOT NULL,
    end_time   TIME             NOT NULL,
    PRIMARY KEY (staff_id, weekday, start_time),
    CONSTRAINT fk_rv_hours_staff FOREIGN KEY (staff_id) REFERENCES rendezvous_staff (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_appointments --------------------------------------------
-- All times, created_at included, are local Mauritius time (UTC+4, no daylight
-- saving), written by the application.
CREATE TABLE IF NOT EXISTS rendezvous_appointments (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  BIGINT UNSIGNED NOT NULL,
    staff_id         BIGINT UNSIGNED NOT NULL,
    service_id       BIGINT UNSIGNED NOT NULL,
    starts_at        DATETIME        NOT NULL,
    ends_at          DATETIME        NOT NULL,
    status           VARCHAR(16)     NOT NULL DEFAULT 'booked', -- booked | done | no_show | cancelled
    customer_name    VARCHAR(120)    NOT NULL,
    phone            VARCHAR(20)     NULL,                      -- local format, as ClientBloom
    email            VARCHAR(254)    NULL,
    note             VARCHAR(500)    NULL,
    source           VARCHAR(8)      NOT NULL,                  -- online | staff
    token            CHAR(48)        NOT NULL,                  -- customer's manage link
    created_ip       VARCHAR(45)     NULL,
    reminder_sent_at DATETIME        NULL,
    survey_sent_at   DATETIME        NULL,
    cancelled_at     DATETIME        NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rv_appt_token (token),
    KEY idx_rv_appt_staff_time (staff_id, starts_at),
    KEY idx_rv_appt_org_time (organization_id, starts_at),
    KEY idx_rv_appt_ip (created_ip, created_at),
    CONSTRAINT fk_rv_appt_org     FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_rv_appt_staff   FOREIGN KEY (staff_id)        REFERENCES rendezvous_staff (id),
    CONSTRAINT fk_rv_appt_service FOREIGN KEY (service_id)      REFERENCES rendezvous_services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- formelio_forms (forms and surveys) ---------------------------------
-- fields: JSON list of {id, type, label, required, options[]}; ids are stable
-- ("f1", "f2", …) so answers stay attached when a form is edited.
CREATE TABLE IF NOT EXISTS formelio_forms (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    title           VARCHAR(200)    NOT NULL,
    description     VARCHAR(1000)   NULL,
    fields          MEDIUMTEXT      NOT NULL,
    status          VARCHAR(8)      NOT NULL DEFAULT 'draft',  -- draft | open | closed
    public_token    CHAR(32)        NOT NULL,                  -- /formelio/f.php?t=…
    thank_you       VARCHAR(500)    NULL,
    notify_email    VARCHAR(254)    NULL,                      -- e-mail on each response
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_formelio_forms_token (public_token),
    KEY idx_formelio_forms_org (organization_id, id),
    CONSTRAINT fk_formelio_forms_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- formelio_responses --------------------------------------------------
-- answers: JSON list of {id, label, type, value}: the label is kept as asked,
-- so a response stays readable after the form changes.
CREATE TABLE IF NOT EXISTS formelio_responses (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    form_id         BIGINT UNSIGNED NOT NULL,
    answers         MEDIUMTEXT      NOT NULL,
    source          VARCHAR(16)     NULL,                      -- e.g. rendezvous:<appointment id>
    created_ip      VARCHAR(45)     NULL,
    created_at      DATETIME        NOT NULL,                  -- Mauritius local time, written by the application
    PRIMARY KEY (id),
    KEY idx_formelio_resp_form (form_id, id),
    KEY idx_formelio_resp_ip (created_ip, created_at),
    CONSTRAINT fk_formelio_resp_org  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_formelio_resp_form FOREIGN KEY (form_id)         REFERENCES formelio_forms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- RendezVous → Formelio: satisfaction survey after an honoured appointment
ALTER TABLE rendezvous_settings
    ADD CONSTRAINT fk_rv_settings_survey FOREIGN KEY (survey_form_id) REFERENCES formelio_forms (id) ON DELETE SET NULL;

-- Optional: a dedicated application user rather than root.
-- CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
-- FLUSH PRIVILEGES;
