-- MIPS back-office: companies follow-up, subscriptions, suspension, action log.
-- Apply once on an existing database, after 019_account_hardening.sql:
--   mysql -u root -p mips_platform < sql/migrations/020_backoffice.sql

ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL AFTER verified_at;

-- A suspended company: its members cannot log in, its public pages close, its data is kept.
ALTER TABLE organizations ADD COLUMN suspended_at DATETIME NULL AFTER document_language;
ALTER TABLE organizations ADD COLUMN suspended_reason VARCHAR(300) NULL AFTER suspended_at;

-- ---- backoffice_log (every action of the MIPS team, and their notes) --------
CREATE TABLE IF NOT EXISTS backoffice_log (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    staff_user_id   BIGINT UNSIGNED NULL,
    organization_id BIGINT UNSIGNED NULL,
    action          VARCHAR(32)     NOT NULL,          -- subscribe | end | extend | suspend | unsuspend | note
    detail          VARCHAR(1000)   NOT NULL DEFAULT '',
    created_at      DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_backoffice_log_org (organization_id, created_at),
    KEY idx_backoffice_log_time (created_at),
    CONSTRAINT fk_backoffice_log_staff FOREIGN KEY (staff_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_backoffice_log_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
