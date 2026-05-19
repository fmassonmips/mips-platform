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

-- Optional: a dedicated application user rather than root.
-- CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
-- FLUSH PRIVILEGES;

-- =========================================================================
-- INSURANCE BROKER PLATFORM — extended schema
-- =========================================================================

-- ---- brokerages ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS brokerages (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name                    VARCHAR(150)    NOT NULL,
    fsc_license_number      VARCHAR(50)     NULL,
    email                   VARCHAR(254)    NOT NULL,
    phone                   VARCHAR(30)     NULL,
    address                 TEXT            NULL,
    mips_merchant_id        VARCHAR(100)    NULL,
    mips_api_key_encrypted  TEXT            NULL,   -- AES-256 encrypted, never plaintext
    whatsapp_number         VARCHAR(30)     NULL,   -- E.164 format e.g. +23057000000
    subscription_plan       VARCHAR(30)     NOT NULL DEFAULT 'trial',   -- trial/starter/growth/pro
    subscription_status     VARCHAR(20)     NOT NULL DEFAULT 'trial',   -- trial/active/suspended/cancelled
    subscription_expires_at DATETIME        NULL,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_brokerages_fsc (fsc_license_number),
    KEY idx_brokerages_subscription_status (subscription_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- agents (broker staff, extends users) --------------------------------
CREATE TABLE IF NOT EXISTS agents (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    brokerage_id        BIGINT UNSIGNED NOT NULL,
    role                ENUM('admin','agent','readonly') NOT NULL DEFAULT 'agent',
    calendar_timezone   VARCHAR(50)     NOT NULL DEFAULT 'Indian/Mauritius',
    working_hours_json  JSON            NULL,       -- {"mon":["09:00","17:00"],"tue":...}
    is_active           TINYINT(1)      NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_agents_user (user_id),
    KEY idx_agents_brokerage (brokerage_id),
    CONSTRAINT fk_agents_user        FOREIGN KEY (user_id)       REFERENCES users (id)       ON DELETE CASCADE,
    CONSTRAINT fk_agents_brokerage   FOREIGN KEY (brokerage_id)  REFERENCES brokerages (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- insurers ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurers (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(100)    NOT NULL,
    short_code      VARCHAR(20)     NOT NULL,   -- swan / mua / jubilee / cim / aml / bai
    api_endpoint    VARCHAR(255)    NULL,        -- Phase 2
    api_key_encrypted TEXT          NULL,        -- Phase 2, encrypted
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_insurers_short_code (short_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- insurer_products ----------------------------------------------------
CREATE TABLE IF NOT EXISTS insurer_products (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    insurer_id      BIGINT UNSIGNED NOT NULL,
    product_type    ENUM('motor','property','life','health','liability','marine','fleet','other') NOT NULL,
    product_name    VARCHAR(150)    NOT NULL,
    description     TEXT            NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_insurer_products_insurer (insurer_id),
    KEY idx_insurer_products_type (product_type),
    CONSTRAINT fk_insurer_products_insurer FOREIGN KEY (insurer_id) REFERENCES insurers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- clients -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    brokerage_id        BIGINT UNSIGNED NOT NULL,
    agent_id            BIGINT UNSIGNED NOT NULL,   -- assigned broker agent
    client_type         ENUM('individual','company') NOT NULL DEFAULT 'individual',
    first_name          VARCHAR(80)     NULL,
    last_name           VARCHAR(80)     NULL,
    company_name        VARCHAR(150)    NULL,
    brn_number          VARCHAR(20)     NULL,        -- Business Registration Number
    nic_number          VARCHAR(20)     NULL,        -- Mauritius NIC — encrypted at app layer
    date_of_birth       DATE            NULL,
    email               VARCHAR(254)    NULL,
    phone_mobile        VARCHAR(30)     NULL,        -- E.164 e.g. +23057000000
    phone_whatsapp      VARCHAR(30)     NULL,        -- may differ from mobile
    address             TEXT            NULL,
    language_pref       ENUM('en','fr') NOT NULL DEFAULT 'en',
    communication_pref  JSON            NULL,        -- ["email","whatsapp"]
    notes               TEXT            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_clients_brokerage  (brokerage_id),
    KEY idx_clients_agent      (agent_id),
    KEY idx_clients_email      (email),
    CONSTRAINT fk_clients_brokerage FOREIGN KEY (brokerage_id) REFERENCES brokerages (id) ON DELETE CASCADE,
    CONSTRAINT fk_clients_agent     FOREIGN KEY (agent_id)     REFERENCES agents (id)     ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- policies ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policies (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id               BIGINT UNSIGNED NOT NULL,
    agent_id                BIGINT UNSIGNED NOT NULL,
    insurer_id              BIGINT UNSIGNED NOT NULL,
    insurer_product_id      BIGINT UNSIGNED NULL,
    policy_number           VARCHAR(60)     NULL,    -- insurer-assigned
    internal_ref            VARCHAR(30)     NOT NULL, -- platform-generated: INS-YYYYMMDD-XXXX
    status                  ENUM('draft','active','lapsed','cancelled','renewed','claimed') NOT NULL DEFAULT 'draft',
    premium_amount          DECIMAL(12,2)   NOT NULL,
    sum_insured             DECIMAL(15,2)   NULL,
    excess_amount           DECIMAL(10,2)   NULL,
    start_date              DATE            NOT NULL,
    end_date                DATE            NOT NULL,
    cover_type              VARCHAR(60)     NULL,    -- comprehensive / third-party / etc.
    payment_frequency       ENUM('annual','semi_annual','quarterly','monthly') NOT NULL DEFAULT 'annual',
    asset_description       TEXT            NULL,    -- "Toyota Vios B1234" / "Villa at Balaclava"
    asset_metadata_json     JSON            NULL,    -- {"make":"Toyota","model":"Vios","year":2021,"reg":"B1234"}
    broker_commission_pct   DECIMAL(5,2)    NULL,
    broker_commission_amt   DECIMAL(10,2)   NULL,    -- calculated: premium * commission_pct / 100
    inspection_required     TINYINT(1)      NOT NULL DEFAULT 0,
    inspection_completed    TINYINT(1)      NOT NULL DEFAULT 0,
    notes                   TEXT            NULL,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_policies_internal_ref (internal_ref),
    KEY idx_policies_client     (client_id),
    KEY idx_policies_agent      (agent_id),
    KEY idx_policies_status     (status),
    KEY idx_policies_end_date   (end_date),       -- used by renewal cron
    CONSTRAINT fk_policies_client           FOREIGN KEY (client_id)          REFERENCES clients (id)           ON DELETE RESTRICT,
    CONSTRAINT fk_policies_agent            FOREIGN KEY (agent_id)           REFERENCES agents (id)            ON DELETE RESTRICT,
    CONSTRAINT fk_policies_insurer          FOREIGN KEY (insurer_id)         REFERENCES insurers (id)          ON DELETE RESTRICT,
    CONSTRAINT fk_policies_insurer_product  FOREIGN KEY (insurer_product_id) REFERENCES insurer_products (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- payment_links -------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_links (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id               BIGINT UNSIGNED NOT NULL,
    renewal_id              BIGINT UNSIGNED NULL,    -- NULL for ad-hoc payments
    generated_by_agent_id   BIGINT UNSIGNED NOT NULL,
    mips_transaction_ref    VARCHAR(100)    NULL,    -- MIPS-assigned reference
    amount                  DECIMAL(12,2)   NOT NULL,
    description             VARCHAR(255)    NULL,
    payment_url             VARCHAR(1000)   NULL,    -- full MIPS redirect URL
    instalment_number       TINYINT UNSIGNED NULL,   -- 1 of N; NULL = full payment
    instalment_total        TINYINT UNSIGNED NULL,   -- N; NULL = full payment
    status                  ENUM('pending','paid','expired','failed','refunded') NOT NULL DEFAULT 'pending',
    expires_at              DATETIME        NULL,
    paid_at                 DATETIME        NULL,
    mips_webhook_payload    JSON            NULL,    -- raw webhook body for audit
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_payment_links_policy         (policy_id),
    KEY idx_payment_links_renewal        (renewal_id),
    KEY idx_payment_links_status         (status),
    KEY idx_payment_links_mips_ref       (mips_transaction_ref),
    CONSTRAINT fk_payment_links_policy    FOREIGN KEY (policy_id)             REFERENCES policies (id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_links_agent     FOREIGN KEY (generated_by_agent_id) REFERENCES agents (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- payment_events (MIPS webhook log) -----------------------------------
CREATE TABLE IF NOT EXISTS payment_events (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    payment_link_id     BIGINT UNSIGNED NOT NULL,
    event_type          VARCHAR(60)     NOT NULL,   -- payment.success / payment.failed
    amount_received     DECIMAL(12,2)   NULL,
    payment_method      VARCHAR(30)     NULL,       -- juice / card / bank_transfer
    mips_reference      VARCHAR(100)    NULL,
    raw_payload         JSON            NOT NULL,
    received_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_payment_events_link      (payment_link_id),
    KEY idx_payment_events_type      (event_type),
    KEY idx_payment_events_received  (received_at),
    CONSTRAINT fk_payment_events_link FOREIGN KEY (payment_link_id) REFERENCES payment_links (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- renewals ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS renewals (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id           BIGINT UNSIGNED NOT NULL,
    payment_link_id     BIGINT UNSIGNED NULL,
    renewal_year        YEAR            NOT NULL,
    status              ENUM('pending','contacted','negotiating','quoted','paid','lapsed','cancelled') NOT NULL DEFAULT 'pending',
    renewal_premium     DECIMAL(12,2)   NULL,       -- may differ from original premium
    trigger_date_j45    DATE            NOT NULL,   -- expiry - 45 days
    trigger_date_j30    DATE            NOT NULL,   -- expiry - 30 days
    trigger_date_j15    DATE            NOT NULL,   -- expiry - 15 days
    j45_sent_at         DATETIME        NULL,
    j30_sent_at         DATETIME        NULL,
    j15_sent_at         DATETIME        NULL,
    j0_sent_at          DATETIME        NULL,
    notes               TEXT            NULL,
    completed_at        DATETIME        NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_renewals_policy_year (policy_id, renewal_year),
    KEY idx_renewals_status          (status),
    KEY idx_renewals_trigger_j45     (trigger_date_j45),  -- cron query index
    KEY idx_renewals_trigger_j30     (trigger_date_j30),
    KEY idx_renewals_trigger_j15     (trigger_date_j15),
    CONSTRAINT fk_renewals_policy       FOREIGN KEY (policy_id)      REFERENCES policies (id)      ON DELETE CASCADE,
    CONSTRAINT fk_renewals_payment_link FOREIGN KEY (payment_link_id) REFERENCES payment_links (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- appointments --------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id               BIGINT UNSIGNED NOT NULL,
    policy_id               BIGINT UNSIGNED NULL,   -- NULL if pre-policy (prospect stage)
    agent_id                BIGINT UNSIGNED NOT NULL,
    appointment_type        ENUM('vehicle_inspection','building_survey','risk_audit','general_meeting') NOT NULL,
    format                  ENUM('in_person','video') NOT NULL DEFAULT 'in_person',
    scheduled_at            DATETIME        NOT NULL,
    duration_minutes        SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    location                VARCHAR(255)    NULL,   -- physical address for in-person
    video_link              VARCHAR(500)    NULL,   -- Whereby / Zoom / Teams URL
    status                  ENUM('scheduled','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
    notes_pre               TEXT            NULL,   -- pre-appointment instructions
    notes_post              TEXT            NULL,   -- broker's outcome notes
    inspection_report_path  VARCHAR(500)    NULL,   -- uploaded PDF storage path
    reminder_sent           TINYINT(1)      NOT NULL DEFAULT 0,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_appointments_client       (client_id),
    KEY idx_appointments_agent        (agent_id),
    KEY idx_appointments_scheduled    (scheduled_at),   -- cron reminder query
    KEY idx_appointments_status       (status),
    CONSTRAINT fk_appointments_client  FOREIGN KEY (client_id)  REFERENCES clients (id)  ON DELETE CASCADE,
    CONSTRAINT fk_appointments_policy  FOREIGN KEY (policy_id)  REFERENCES policies (id) ON DELETE SET NULL,
    CONSTRAINT fk_appointments_agent   FOREIGN KEY (agent_id)   REFERENCES agents (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- documents -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id               BIGINT UNSIGNED NOT NULL,
    policy_id               BIGINT UNSIGNED NULL,
    appointment_id          BIGINT UNSIGNED NULL,
    uploaded_by_agent_id    BIGINT UNSIGNED NOT NULL,
    document_type           ENUM('policy_schedule','cover_note','inspection_report','claim_form','id_copy','other') NOT NULL,
    filename                VARCHAR(255)    NOT NULL,
    storage_path            VARCHAR(500)    NOT NULL,  -- S3 key or local path
    file_size_bytes         INT UNSIGNED    NULL,
    mime_type               VARCHAR(100)    NULL,
    is_confidential         TINYINT(1)      NOT NULL DEFAULT 0,   -- admin-only access
    uploaded_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_documents_client      (client_id),
    KEY idx_documents_policy      (policy_id),
    KEY idx_documents_appointment (appointment_id),
    CONSTRAINT fk_documents_client      FOREIGN KEY (client_id)             REFERENCES clients (id)       ON DELETE CASCADE,
    CONSTRAINT fk_documents_policy      FOREIGN KEY (policy_id)             REFERENCES policies (id)      ON DELETE SET NULL,
    CONSTRAINT fk_documents_appointment FOREIGN KEY (appointment_id)        REFERENCES appointments (id)  ON DELETE SET NULL,
    CONSTRAINT fk_documents_agent       FOREIGN KEY (uploaded_by_agent_id)  REFERENCES agents (id)        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- notification_templates ----------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    template_key    VARCHAR(60)     NOT NULL,   -- renewal_j45 / renewal_j30 / appt_confirm / receipt
    channel         ENUM('email','whatsapp','sms') NOT NULL,
    language        ENUM('en','fr') NOT NULL DEFAULT 'en',
    subject         VARCHAR(255)    NULL,       -- email only
    body_template   TEXT            NOT NULL,   -- Twig/Handlebars syntax with {{variables}}
    variables_json  JSON            NULL,       -- expected variable list for validation
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification_templates_key_channel_lang (template_key, channel, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- communications (outbound message log) --------------------------------
CREATE TABLE IF NOT EXISTS communications (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id       BIGINT UNSIGNED NOT NULL,
    renewal_id      BIGINT UNSIGNED NULL,
    appointment_id  BIGINT UNSIGNED NULL,
    channel         ENUM('email','whatsapp','sms','in_app') NOT NULL,
    direction       ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
    template_key    VARCHAR(60)     NULL,
    subject         VARCHAR(255)    NULL,
    body            TEXT            NOT NULL,
    status          ENUM('queued','sent','delivered','failed','read') NOT NULL DEFAULT 'queued',
    sent_at         DATETIME        NULL,
    delivered_at    DATETIME        NULL,
    read_at         DATETIME        NULL,
    error_detail    TEXT            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_communications_client      (client_id),
    KEY idx_communications_renewal     (renewal_id),
    KEY idx_communications_status      (status),
    KEY idx_communications_created     (created_at),
    CONSTRAINT fk_communications_client      FOREIGN KEY (client_id)      REFERENCES clients (id)       ON DELETE CASCADE,
    CONSTRAINT fk_communications_renewal     FOREIGN KEY (renewal_id)     REFERENCES renewals (id)      ON DELETE SET NULL,
    CONSTRAINT fk_communications_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- audit_log -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id   BIGINT UNSIGNED NULL,       -- NULL for system/cron actions
    actor_ip        VARCHAR(45)     NULL,
    entity_type     VARCHAR(60)     NOT NULL,   -- policy / client / renewal / payment_link
    entity_id       BIGINT UNSIGNED NOT NULL,
    action          VARCHAR(60)     NOT NULL,   -- created / updated / deleted / status_changed
    old_values_json JSON            NULL,
    new_values_json JSON            NULL,
    occurred_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_log_entity      (entity_type, entity_id),
    KEY idx_audit_log_actor       (actor_user_id),
    KEY idx_audit_log_occurred    (occurred_at),
    CONSTRAINT fk_audit_log_user FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================================
-- Optional: a dedicated application user rather than root.
-- CREATE USER 'mips_user'@'localhost' IDENTIFIED BY 'change_me_in_production';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_user'@'localhost';
-- FLUSH PRIVILEGES;
