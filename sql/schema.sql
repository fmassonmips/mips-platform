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

-- Optional: a dedicated application user rather than root.
-- CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
-- FLUSH PRIVILEGES;
