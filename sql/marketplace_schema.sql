-- =========================================================================
-- InsurLink MU — Marketplace Schema Extension
-- Centralisation des offres d'assurance à Maurice
--
-- Requires: sql/schema.sql (broker platform base) to be applied first.
--
-- Usage:
--   mysql -u root -p mips_platform < sql/marketplace_schema.sql
-- =========================================================================

USE mips_platform;

-- ---- consumers -----------------------------------------------------------
-- Direct B2C users (distinct from broker agents)
CREATE TABLE IF NOT EXISTS consumers (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    first_name          VARCHAR(80)     NULL,
    last_name           VARCHAR(80)     NULL,
    nic_number          VARCHAR(20)     NULL,    -- encrypted at application layer
    date_of_birth       DATE            NULL,
    email               VARCHAR(254)    NULL,
    phone_mobile        VARCHAR(30)     NULL,    -- E.164
    phone_whatsapp      VARCHAR(30)     NULL,
    language_pref       ENUM('en','fr') NOT NULL DEFAULT 'en',
    address             TEXT            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_consumers_user (user_id),
    KEY idx_consumers_email (email),
    CONSTRAINT fk_consumers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- insurer_users -------------------------------------------------------
-- Accounts for insurer staff accessing the insurer portal
CREATE TABLE IF NOT EXISTS insurer_users (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    insurer_id  BIGINT UNSIGNED NOT NULL,
    role        ENUM('admin','product_manager','analyst') NOT NULL DEFAULT 'product_manager',
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_insurer_users_user (user_id),
    KEY idx_insurer_users_insurer (insurer_id),
    CONSTRAINT fk_insurer_users_user    FOREIGN KEY (user_id)    REFERENCES users (id)     ON DELETE CASCADE,
    CONSTRAINT fk_insurer_users_insurer FOREIGN KEY (insurer_id) REFERENCES insurers (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- insurer_rate_tables -------------------------------------------------
-- Pricing grids per insurer product, with approval workflow
CREATE TABLE IF NOT EXISTS insurer_rate_tables (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    insurer_product_id      BIGINT UNSIGNED NOT NULL,
    name                    VARCHAR(100)    NOT NULL,       -- e.g. "Tarif Auto 2026"
    base_premium_annual     DECIMAL(12,2)   NOT NULL,       -- base before rating factors
    minimum_premium         DECIMAL(10,2)   NOT NULL DEFAULT 0,
    currency                CHAR(3)         NOT NULL DEFAULT 'MUR',
    acceptance_rules_json   JSON            NULL,           -- eligibility criteria
    valid_from              DATE            NOT NULL,
    valid_to                DATE            NULL,           -- NULL = indefinite
    is_active               TINYINT(1)      NOT NULL DEFAULT 0,   -- activated by admin after approval
    submitted_by_insurer_id BIGINT UNSIGNED NOT NULL,
    submitted_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by_user_id     BIGINT UNSIGNED NULL,
    approved_at             DATETIME        NULL,
    rejection_reason        TEXT            NULL,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rate_tables_product    (insurer_product_id),
    KEY idx_rate_tables_active     (is_active, valid_from, valid_to),
    KEY idx_rate_tables_insurer    (submitted_by_insurer_id),
    CONSTRAINT fk_rate_tables_product  FOREIGN KEY (insurer_product_id)    REFERENCES insurer_products (id) ON DELETE CASCADE,
    CONSTRAINT fk_rate_tables_insurer  FOREIGN KEY (submitted_by_insurer_id) REFERENCES insurers (id)       ON DELETE RESTRICT,
    CONSTRAINT fk_rate_tables_approver FOREIGN KEY (approved_by_user_id)   REFERENCES users (id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rating_factors ------------------------------------------------------
-- Multiplicative/additive pricing factors applied to base premium
CREATE TABLE IF NOT EXISTS rating_factors (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rate_table_id   BIGINT UNSIGNED NOT NULL,
    factor_name     VARCHAR(60)     NOT NULL,   -- vehicle_age / driver_age / sum_insured / usage / etc.
    factor_label_en VARCHAR(100)    NULL,        -- Human-readable label (English)
    factor_label_fr VARCHAR(100)    NULL,        -- Human-readable label (French)
    factor_type     ENUM('multiplier','additive','percentage','lookup') NOT NULL,
    apply_order     TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- lower = applied first
    rules_json      JSON            NOT NULL,   -- bracket tables or formula params
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rating_factors_table (rate_table_id),
    KEY idx_rating_factors_order (rate_table_id, apply_order),
    CONSTRAINT fk_rating_factors_table FOREIGN KEY (rate_table_id) REFERENCES insurer_rate_tables (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rating_discounts ----------------------------------------------------
-- Discounts applicable under specific conditions (no-claims, multi-policy, etc.)
CREATE TABLE IF NOT EXISTS rating_discounts (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rate_table_id   BIGINT UNSIGNED NOT NULL,
    discount_name   VARCHAR(60)     NOT NULL,   -- no_claims_bonus / multi_policy / loyalty
    discount_label_en VARCHAR(100)  NULL,
    discount_label_fr VARCHAR(100)  NULL,
    discount_type   ENUM('percentage','fixed_amount') NOT NULL,
    discount_value  DECIMAL(8,4)    NOT NULL,   -- % or MUR amount
    condition_json  JSON            NULL,        -- eligibility conditions
    max_cumulative_pct DECIMAL(5,2) NULL,        -- cap on total discount
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rating_discounts_table (rate_table_id),
    CONSTRAINT fk_rating_discounts_table FOREIGN KEY (rate_table_id) REFERENCES insurer_rate_tables (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- quote_requests ------------------------------------------------------
-- A single comparison session (one risk, N insurer responses)
CREATE TABLE IF NOT EXISTS quote_requests (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reference           VARCHAR(20)     NOT NULL,   -- QR-YYYYMMDD-XXXXX (public)
    portal_origin       ENUM('consumer','broker','public') NOT NULL DEFAULT 'public',
    consumer_id         BIGINT UNSIGNED NULL,        -- set if logged-in consumer
    broker_agent_id     BIGINT UNSIGNED NULL,        -- set if generated by broker
    client_id           BIGINT UNSIGNED NULL,        -- set if broker's CRM client
    product_type        ENUM('motor','property','health','liability','marine','fleet','other') NOT NULL,
    risk_profile_json   JSON            NOT NULL,   -- all risk data (vehicle, driver, property...)
    status              ENUM('pending','quoted','selected','paid','expired','cancelled') NOT NULL DEFAULT 'pending',
    expires_at          DATETIME        NULL,        -- quote results valid until
    session_token       VARCHAR(64)     NULL,        -- for anonymous visitors
    ip_address          VARCHAR(45)     NULL,
    user_agent          VARCHAR(500)    NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_quote_requests_ref (reference),
    KEY idx_qr_consumer     (consumer_id),
    KEY idx_qr_broker_agent (broker_agent_id),
    KEY idx_qr_client       (client_id),
    KEY idx_qr_status       (status),
    KEY idx_qr_product_type (product_type),
    KEY idx_qr_created      (created_at),
    CONSTRAINT fk_qr_consumer     FOREIGN KEY (consumer_id)     REFERENCES consumers (id) ON DELETE SET NULL,
    CONSTRAINT fk_qr_broker_agent FOREIGN KEY (broker_agent_id) REFERENCES agents (id)    ON DELETE SET NULL,
    CONSTRAINT fk_qr_client       FOREIGN KEY (client_id)       REFERENCES clients (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- quote_results -------------------------------------------------------
-- One row per insurer/product combination per quote request
CREATE TABLE IF NOT EXISTS quote_results (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    quote_request_id            BIGINT UNSIGNED NOT NULL,
    insurer_id                  BIGINT UNSIGNED NOT NULL,
    insurer_product_id          BIGINT UNSIGNED NOT NULL,
    rate_table_id               BIGINT UNSIGNED NOT NULL,
    premium_annual              DECIMAL(12,2)   NULL,    -- NULL if unavailable
    premium_monthly             DECIMAL(12,2)   NULL,    -- if monthly option available
    sum_insured                 DECIMAL(15,2)   NULL,
    excess_amount               DECIMAL(10,2)   NULL,
    cover_highlights_json       JSON            NULL,    -- key cover features [{label, included}]
    exclusions_json             JSON            NULL,    -- key exclusions [{label}]
    calculation_breakdown_json  JSON            NULL,    -- full factor-by-factor audit trail
    discounts_applied_json      JSON            NULL,    -- discounts that applied
    coverage_score              TINYINT UNSIGNED NULL,   -- /100
    value_score                 TINYINT UNSIGNED NULL,   -- /100
    ai_recommendation_rank      TINYINT UNSIGNED NULL,   -- Phase 2 — NULL until then
    ai_rationale                TEXT            NULL,    -- Phase 2
    is_available                TINYINT(1)      NOT NULL DEFAULT 1,
    unavailability_reason       VARCHAR(255)    NULL,
    created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_qresult_request   (quote_request_id),
    KEY idx_qresult_insurer   (insurer_id),
    KEY idx_qresult_product   (insurer_product_id),
    KEY idx_qresult_available (is_available),
    CONSTRAINT fk_qresult_request  FOREIGN KEY (quote_request_id)  REFERENCES quote_requests (id)    ON DELETE CASCADE,
    CONSTRAINT fk_qresult_insurer  FOREIGN KEY (insurer_id)        REFERENCES insurers (id)          ON DELETE RESTRICT,
    CONSTRAINT fk_qresult_product  FOREIGN KEY (insurer_product_id) REFERENCES insurer_products (id) ON DELETE RESTRICT,
    CONSTRAINT fk_qresult_table    FOREIGN KEY (rate_table_id)     REFERENCES insurer_rate_tables (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- selected_quotes -----------------------------------------------------
-- When a user picks one quote_result to proceed with
CREATE TABLE IF NOT EXISTS selected_quotes (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    quote_request_id    BIGINT UNSIGNED NOT NULL,
    quote_result_id     BIGINT UNSIGNED NOT NULL,
    selected_by_user_id BIGINT UNSIGNED NOT NULL,
    selection_reason    TEXT            NULL,
    payment_link_id     BIGINT UNSIGNED NULL,
    cover_note_path     VARCHAR(500)    NULL,   -- generated PDF storage path
    cover_note_sent_at  DATETIME        NULL,
    policy_id           BIGINT UNSIGNED NULL,   -- created in CRM after payment (broker flow)
    status              ENUM('selected','payment_pending','paid','policy_issued','cancelled') NOT NULL DEFAULT 'selected',
    selected_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sq_request      (quote_request_id),
    KEY idx_sq_result       (quote_result_id),
    KEY idx_sq_status       (status),
    CONSTRAINT fk_sq_request      FOREIGN KEY (quote_request_id) REFERENCES quote_requests (id) ON DELETE CASCADE,
    CONSTRAINT fk_sq_result       FOREIGN KEY (quote_result_id)  REFERENCES quote_results (id)  ON DELETE CASCADE,
    CONSTRAINT fk_sq_user         FOREIGN KEY (selected_by_user_id) REFERENCES users (id)       ON DELETE RESTRICT,
    CONSTRAINT fk_sq_payment_link FOREIGN KEY (payment_link_id)  REFERENCES payment_links (id)  ON DELETE SET NULL,
    CONSTRAINT fk_sq_policy       FOREIGN KEY (policy_id)        REFERENCES policies (id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- leads ---------------------------------------------------------------
-- Revenue-generating events tracked per insurer
CREATE TABLE IF NOT EXISTS leads (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    insurer_id          BIGINT UNSIGNED NOT NULL,
    quote_result_id     BIGINT UNSIGNED NOT NULL,
    quote_request_id    BIGINT UNSIGNED NOT NULL,
    lead_type           ENUM('quote_shown','quote_selected','payment_made') NOT NULL,
    lead_value_mur      DECIMAL(10,2)   NULL,   -- amount to invoice insurer
    commission_rule_id  BIGINT UNSIGNED NULL,   -- which platform_commissions row applied
    invoiced_at         DATETIME        NULL,   -- NULL until invoiced
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leads_insurer   (insurer_id),
    KEY idx_leads_type      (lead_type),
    KEY idx_leads_invoiced  (invoiced_at),
    KEY idx_leads_request   (quote_request_id),
    CONSTRAINT fk_leads_insurer  FOREIGN KEY (insurer_id)       REFERENCES insurers (id)       ON DELETE RESTRICT,
    CONSTRAINT fk_leads_result   FOREIGN KEY (quote_result_id)  REFERENCES quote_results (id)  ON DELETE CASCADE,
    CONSTRAINT fk_leads_request  FOREIGN KEY (quote_request_id) REFERENCES quote_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- platform_commissions ------------------------------------------------
-- Commission structure per insurer and lead type
CREATE TABLE IF NOT EXISTS platform_commissions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    insurer_id          BIGINT UNSIGNED NOT NULL,
    insurer_product_id  BIGINT UNSIGNED NULL,   -- NULL = applies to all products
    commission_type     ENUM('per_lead_shown','per_lead_selected','per_policy_placed','subscription') NOT NULL,
    commission_value    DECIMAL(10,4)   NOT NULL,   -- % (0–100) or fixed MUR amount
    value_type          ENUM('percentage','fixed_mur') NOT NULL DEFAULT 'fixed_mur',
    effective_from      DATE            NOT NULL,
    effective_to        DATE            NULL,       -- NULL = indefinite
    is_active           TINYINT(1)      NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pc_insurer         (insurer_id),
    KEY idx_pc_product         (insurer_product_id),
    KEY idx_pc_type            (commission_type),
    KEY idx_pc_active_dates    (is_active, effective_from, effective_to),
    CONSTRAINT fk_pc_insurer FOREIGN KEY (insurer_id)          REFERENCES insurers (id)          ON DELETE CASCADE,
    CONSTRAINT fk_pc_product FOREIGN KEY (insurer_product_id)  REFERENCES insurer_products (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- cover_note_templates ------------------------------------------------
-- HTML templates for cover note PDFs, per insurer product
CREATE TABLE IF NOT EXISTS cover_note_templates (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    insurer_id      BIGINT UNSIGNED NOT NULL,
    product_type    ENUM('motor','property','health','liability','marine','fleet','other') NOT NULL,
    template_name   VARCHAR(100)    NOT NULL,
    template_html   LONGTEXT        NOT NULL,   -- HTML with {{variable}} placeholders
    variables_json  JSON            NULL,        -- expected variables list
    version         TINYINT UNSIGNED NOT NULL DEFAULT 1,
    is_active       TINYINT(1)      NOT NULL DEFAULT 0,   -- activated after admin approval
    submitted_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at     DATETIME        NULL,
    approved_by_user_id BIGINT UNSIGNED NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cnt_insurer      (insurer_id),
    KEY idx_cnt_product_type (product_type),
    CONSTRAINT fk_cnt_insurer   FOREIGN KEY (insurer_id)          REFERENCES insurers (id) ON DELETE CASCADE,
    CONSTRAINT fk_cnt_approver  FOREIGN KEY (approved_by_user_id) REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- marketplace_analytics -----------------------------------------------
-- Lightweight event log for funnel analytics (not used for billing)
CREATE TABLE IF NOT EXISTS marketplace_analytics (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_type      VARCHAR(60)     NOT NULL,   -- quote_started/quote_completed/product_viewed/payment_made
    portal_origin   ENUM('consumer','broker','public') NOT NULL DEFAULT 'public',
    insurer_id      BIGINT UNSIGNED NULL,
    product_type    VARCHAR(30)     NULL,
    premium_amount  DECIMAL(12,2)   NULL,
    session_id      VARCHAR(64)     NULL,
    user_id         BIGINT UNSIGNED NULL,
    metadata_json   JSON            NULL,        -- additional event-specific data
    occurred_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ma_event_type  (event_type),
    KEY idx_ma_portal      (portal_origin),
    KEY idx_ma_insurer     (insurer_id),
    KEY idx_ma_occurred    (occurred_at),
    KEY idx_ma_session     (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- ai_recommendations --------------------------------------------------
-- Audit log of all AI-generated quote recommendations (Phase 2)
CREATE TABLE IF NOT EXISTS ai_recommendations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    quote_request_id    BIGINT UNSIGNED NOT NULL,
    model_version       VARCHAR(60)     NOT NULL,   -- e.g. claude-sonnet-4-6
    prompt_hash         VARCHAR(64)     NULL,        -- SHA-256 of prompt for dedup
    input_json          JSON            NOT NULL,   -- risk profile + quotes sent to AI
    output_json         JSON            NOT NULL,   -- AI response (ranked results + rationale)
    latency_ms          INT UNSIGNED    NULL,
    broker_overridden   TINYINT(1)      NOT NULL DEFAULT 0,  -- 1 if broker changed AI ranking
    override_reason     TEXT            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ai_rec_request (quote_request_id),
    KEY idx_ai_rec_created (created_at),
    CONSTRAINT fk_ai_rec_request FOREIGN KEY (quote_request_id) REFERENCES quote_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
