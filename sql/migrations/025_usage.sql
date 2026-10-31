-- Usage history: the days each member used the app (one row per member and day, no more detail).
-- Apply once on an existing database, after 024_terms.sql:
--   mysql -u root -p mips_platform < sql/migrations/025_usage.sql

-- ---- user_activity (days a member used my.mips.mu, kept 13 months) --------
CREATE TABLE IF NOT EXISTS user_activity (
    organization_id BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    day             DATE            NOT NULL,              -- Mauritius date
    PRIMARY KEY (organization_id, user_id, day),
    KEY idx_user_activity_day (organization_id, day),
    CONSTRAINT fk_user_activity_org  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_activity_user FOREIGN KEY (user_id)         REFERENCES users (id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
