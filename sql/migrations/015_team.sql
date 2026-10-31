-- Team: invite colleagues into a company by e-mail.
-- Apply once on an existing database, after 014_shoplokal.sql:
--   mysql -u root -p mips_platform < sql/migrations/015_team.sql

-- ---- organization_invitations ----------------------------------------------
-- Only the SHA-256 of the link token is stored: a database leak does not
-- give working invitation links. One pending invitation per e-mail and company.
CREATE TABLE IF NOT EXISTS organization_invitations (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    email           VARCHAR(254)    NOT NULL,
    role            VARCHAR(16)     NOT NULL DEFAULT 'member',  -- admin | member
    token_hash      CHAR(64)        NOT NULL,
    invited_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME        NOT NULL,
    expires_at      DATETIME        NOT NULL,
    accepted_at     DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_org_inv_token (token_hash),
    UNIQUE KEY uq_org_inv_email (organization_id, email),
    KEY idx_org_inv_created (organization_id, created_at),
    CONSTRAINT fk_org_inv_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_org_inv_by  FOREIGN KEY (invited_by)      REFERENCES users (id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
