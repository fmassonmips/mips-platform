-- MRA e-invoicing (fiscalisation of invoices and credit notes).
-- Apply once on an existing database, after 003_facturo_credit_notes_email.sql:
--   mysql -u root -p mips_platform < sql/migrations/004_mra_einvoicing.sql

ALTER TABLE organizations
    ADD COLUMN mra_enabled      TINYINT(1)  NOT NULL DEFAULT 0 AFTER phone,
    ADD COLUMN mra_username     VARCHAR(100) NULL AFTER mra_enabled,
    ADD COLUMN mra_password_enc TEXT         NULL AFTER mra_username,
    ADD COLUMN mra_ebs_id       VARCHAR(50)  NULL AFTER mra_password_enc;

ALTER TABLE facturo_documents
    ADD COLUMN mra_status        VARCHAR(16)   NULL AFTER public_token,
    ADD COLUMN mra_counter       INT UNSIGNED  NULL AFTER mra_status,
    ADD COLUMN mra_irn           VARCHAR(100)  NULL AFTER mra_counter,
    ADD COLUMN mra_qr            MEDIUMTEXT    NULL AFTER mra_irn,
    ADD COLUMN mra_error         VARCHAR(1000) NULL AFTER mra_qr,
    ADD COLUMN mra_attempts      SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER mra_error,
    ADD COLUMN mra_fiscalised_at DATETIME      NULL AFTER mra_attempts,
    ADD KEY idx_facturo_documents_mra (organization_id, mra_status, mra_counter);

ALTER TABLE facturo_document_lines
    ADD COLUMN tax_code VARCHAR(4) NULL AFTER tax_rate,
    ADD COLUMN nature   VARCHAR(8) NULL AFTER tax_code;

-- ---- mra_tokens (cached MRA authentication per organization) -----------
CREATE TABLE IF NOT EXISTS mra_tokens (
    organization_id BIGINT UNSIGNED NOT NULL,
    token           VARCHAR(1000) NOT NULL,
    session_key_enc TEXT          NOT NULL,                 -- AES key returned by MRA, encrypted at rest
    expires_at      DATETIME      NOT NULL,
    PRIMARY KEY (organization_id),
    CONSTRAINT fk_mra_tokens_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
