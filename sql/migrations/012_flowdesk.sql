-- FlowDesk: customer support tickets, and Formelio responses as tickets.
-- Apply once on an existing database, after 011_formelio.sql:
--   mysql -u root -p mips_platform < sql/migrations/012_flowdesk.sql

-- ---- flowdesk_settings (one row per org) --------------------------------
CREATE TABLE IF NOT EXISTS flowdesk_settings (
    organization_id BIGINT UNSIGNED NOT NULL,
    public_token    CHAR(32)        NOT NULL,                  -- support form /flowdesk/new.php?o=…
    form_enabled    TINYINT(1)      NOT NULL DEFAULT 1,
    notify_email    VARCHAR(254)    NULL,                      -- new tickets and customer replies
    intro           VARCHAR(500)    NULL,
    last_number     INT UNSIGNED    NOT NULL DEFAULT 0,        -- ticket numbering, gap-free per org
    PRIMARY KEY (organization_id),
    UNIQUE KEY uq_fd_settings_token (public_token),
    CONSTRAINT fk_fd_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- flowdesk_tickets ------------------------------------------------------
-- All times are Mauritius local time, written by the application.
CREATE TABLE IF NOT EXISTS flowdesk_tickets (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id   BIGINT UNSIGNED NOT NULL,
    number            INT UNSIGNED    NOT NULL,                -- shown as #123
    subject           VARCHAR(200)    NOT NULL,
    status            VARCHAR(8)      NOT NULL DEFAULT 'open', -- open | pending | resolved | closed
    priority          VARCHAR(8)      NOT NULL DEFAULT 'normal', -- low | normal | high | urgent
    assignee_id       BIGINT UNSIGNED NULL,
    customer_name     VARCHAR(120)    NOT NULL,
    email             VARCHAR(254)    NULL,
    phone             VARCHAR(20)     NULL,
    source            VARCHAR(16)     NOT NULL,                -- web | staff | formelio
    token             CHAR(48)        NOT NULL,                -- customer's ticket page
    created_ip        VARCHAR(45)     NULL,
    created_at        DATETIME        NOT NULL,
    updated_at        DATETIME        NOT NULL,                -- last message or change
    first_response_at DATETIME        NULL,                    -- first reply to the customer
    resolved_at       DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fd_tickets_number (organization_id, number),
    UNIQUE KEY uq_fd_tickets_token (token),
    KEY idx_fd_tickets_org_status (organization_id, status, updated_at),
    KEY idx_fd_tickets_ip (created_ip, created_at),
    CONSTRAINT fk_fd_tickets_org      FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_fd_tickets_assignee FOREIGN KEY (assignee_id)     REFERENCES users (id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- flowdesk_messages (thread: customer, agent reply, internal note) ----
CREATE TABLE IF NOT EXISTS flowdesk_messages (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ticket_id   BIGINT UNSIGNED NOT NULL,
    kind        VARCHAR(8)      NOT NULL,                      -- customer | reply | note
    user_id     BIGINT UNSIGNED NULL,                          -- agent, for reply / note
    body        TEXT            NOT NULL,
    created_ip  VARCHAR(45)     NULL,
    created_at  DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_fd_messages_ticket (ticket_id, id),
    CONSTRAINT fk_fd_messages_ticket FOREIGN KEY (ticket_id) REFERENCES flowdesk_tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_fd_messages_user   FOREIGN KEY (user_id)   REFERENCES users (id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE formelio_forms
    ADD COLUMN flowdesk_ticket TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_email;
