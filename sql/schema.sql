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

-- ---- clients (CRM) -----------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    type            ENUM('individual','company') NOT NULL DEFAULT 'individual',
    name            VARCHAR(160) NOT NULL,
    email           VARCHAR(254) NULL,
    phone           VARCHAR(40)  NULL,
    address         VARCHAR(255) NULL,
    city            VARCHAR(120) NULL,
    notes           TEXT         NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_clients_name       (name),
    KEY idx_clients_type       (type),
    KEY idx_clients_created_by (created_by),
    CONSTRAINT fk_clients_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- client_interactions (history) -------------------------------------
CREATE TABLE IF NOT EXISTS client_interactions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id       BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NULL,
    type            ENUM('note','call','email','meeting') NOT NULL DEFAULT 'note',
    summary         VARCHAR(255) NOT NULL,
    details         TEXT         NULL,
    occurred_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_interactions_client (client_id, occurred_at),
    CONSTRAINT fk_interactions_client FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE CASCADE,
    CONSTRAINT fk_interactions_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- contracts / policies ----------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id       BIGINT UNSIGNED NOT NULL,
    policy_number   VARCHAR(80)  NOT NULL,
    insurer         VARCHAR(160) NOT NULL,
    type            VARCHAR(60)  NOT NULL,   -- auto, home, health, life, travel, business, other
    premium         DECIMAL(12,2) NOT NULL DEFAULT 0,
    commission_rate DECIMAL(5,2)  NOT NULL DEFAULT 0,   -- percent of premium
    start_date      DATE NOT NULL,           -- date d'effet
    end_date        DATE NOT NULL,           -- date d'échéance
    status          ENUM('active','pending','expired','cancelled','renewed')
                        NOT NULL DEFAULT 'active',
    notes           TEXT NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contracts_client (client_id),
    KEY idx_contracts_status (status),
    KEY idx_contracts_end    (end_date),
    KEY idx_contracts_policy (policy_number),
    CONSTRAINT fk_contracts_client FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE CASCADE,
    CONSTRAINT fk_contracts_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- quotes / devis ----------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id         BIGINT UNSIGNED NOT NULL,
    reference         VARCHAR(40)  NOT NULL,
    type              VARCHAR(60)  NOT NULL,
    details           TEXT         NULL,
    estimated_premium DECIMAL(12,2) NULL,
    status            ENUM('new','in_progress','converted','declined')
                          NOT NULL DEFAULT 'new',
    contract_id       BIGINT UNSIGNED NULL,   -- set when converted to a policy
    created_by        BIGINT UNSIGNED NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_quotes_reference (reference),
    KEY idx_quotes_client (client_id),
    KEY idx_quotes_status (status),
    CONSTRAINT fk_quotes_client FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE CASCADE,
    CONSTRAINT fk_quotes_contract FOREIGN KEY (contract_id)
        REFERENCES contracts (id) ON DELETE SET NULL,
    CONSTRAINT fk_quotes_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: a dedicated application user rather than root.
-- CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
-- FLUSH PRIVILEGES;
