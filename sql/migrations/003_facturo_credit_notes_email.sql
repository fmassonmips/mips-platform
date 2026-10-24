-- Facturo: credit notes (new document type, no schema change needed) and e-mail sending.
-- Apply once on an existing database, after 002_facturo.sql:
--   mysql -u root -p mips_platform < sql/migrations/003_facturo_credit_notes_email.sql

ALTER TABLE facturo_documents
    ADD COLUMN public_token VARCHAR(64) NULL AFTER client_snapshot,
    ADD UNIQUE KEY uq_facturo_documents_public_token (public_token);

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
