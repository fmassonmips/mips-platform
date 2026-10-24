-- Facturo (quotes & invoices) + company profile on organizations.
-- Apply once on an existing database, after 001_suite.sql:
--   mysql -u root -p mips_platform < sql/migrations/002_facturo.sql

ALTER TABLE organizations
    ADD COLUMN legal_name  VARCHAR(200) NULL AFTER name,
    ADD COLUMN address     VARCHAR(500) NULL AFTER legal_name,
    ADD COLUMN brn         VARCHAR(40)  NULL AFTER address,
    ADD COLUMN vat_number  VARCHAR(40)  NULL AFTER brn,
    ADD COLUMN email       VARCHAR(254) NULL AFTER vat_number,
    ADD COLUMN phone       VARCHAR(40)  NULL AFTER email;

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
    type               VARCHAR(16)  NOT NULL,               -- quote | invoice
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
    source_document_id BIGINT UNSIGNED NULL,               -- invoice created from a quote
    seller_snapshot    TEXT         NULL,
    client_snapshot    TEXT         NULL,
    issued_at          DATETIME     NULL,
    paid_at            DATETIME     NULL,
    created_by         BIGINT UNSIGNED NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_facturo_documents_number (organization_id, type, number),
    KEY idx_facturo_documents_org_type (organization_id, type, created_at),
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
