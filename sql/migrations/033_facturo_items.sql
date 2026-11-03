-- Facturo catalogue: the usual products and services, added to a quote or an invoice in one click.
-- Apply once on an existing database, after 032_mra_hardening.sql:
--   mysql -u root -p mips_platform < sql/migrations/033_facturo_items.sql
-- (or tools/update.sh).

-- ---- facturo_items (catalogue of the usual products and services) --------
CREATE TABLE IF NOT EXISTS facturo_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  BIGINT UNSIGNED NOT NULL,
    name             VARCHAR(200)  NOT NULL,                  -- line description when added to a document
    unit_price_cents BIGINT        NOT NULL,                  -- excl. tax, like document lines
    tax_code         VARCHAR(4)    NOT NULL,                  -- MRA: TC01 | TC02 | TC03
    nature           VARCHAR(8)    NOT NULL,                  -- MRA: GOODS | SERVICES
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_facturo_items_name (organization_id, name),
    CONSTRAINT fk_facturo_items_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
