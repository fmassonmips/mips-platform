-- Suite foundation: tenants, memberships and module activation.
-- Apply on an existing database:  mysql -u root -p mips_platform < sql/migrations/001_suite.sql

-- ---- organizations (tenants: each client company) --------------------
CREATE TABLE IF NOT EXISTS organizations (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(160) NOT NULL,
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
    status          VARCHAR(16)  NOT NULL DEFAULT 'trial',  -- trial | active
    activated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trial_ends_at   DATETIME     NULL,
    PRIMARY KEY (organization_id, module_slug),
    CONSTRAINT fk_org_modules_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
