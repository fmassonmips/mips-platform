-- TeamNest: projects, tasks and billable time.
-- Apply once on an existing database, after 012_flowdesk.sql:
--   mysql -u root -p mips_platform < sql/migrations/013_teamnest.sql

-- ---- teamnest_projects ----------------------------------------------------
CREATE TABLE IF NOT EXISTS teamnest_projects (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id   BIGINT UNSIGNED NOT NULL,
    name              VARCHAR(150)    NOT NULL,
    description       VARCHAR(2000)   NULL,
    client_id         BIGINT UNSIGNED NULL,                  -- Facturo client billed for the time
    hourly_rate_cents BIGINT          NULL,                  -- MUR, excl. VAT
    status            VARCHAR(8)      NOT NULL DEFAULT 'active', -- active | archived
    created_at        DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_tn_projects_org (organization_id, status, name),
    CONSTRAINT fk_tn_projects_org    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_tn_projects_client FOREIGN KEY (client_id)       REFERENCES facturo_clients (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- teamnest_tasks -------------------------------------------------------
-- All times are Mauritius local time, written by the application.
CREATE TABLE IF NOT EXISTS teamnest_tasks (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id    BIGINT UNSIGNED NOT NULL,
    project_id         BIGINT UNSIGNED NOT NULL,
    title              VARCHAR(200)    NOT NULL,
    description        TEXT            NULL,
    status             VARCHAR(8)      NOT NULL DEFAULT 'todo',  -- todo | doing | done
    priority           VARCHAR(8)      NOT NULL DEFAULT 'normal', -- normal | high
    assignee_id        BIGINT UNSIGNED NULL,
    due_date           DATE            NULL,
    flowdesk_ticket_id BIGINT UNSIGNED NULL,                 -- created from a support ticket
    created_by         BIGINT UNSIGNED NULL,
    created_at         DATETIME        NOT NULL,
    updated_at         DATETIME        NOT NULL,
    done_at            DATETIME        NULL,
    PRIMARY KEY (id),
    KEY idx_tn_tasks_project (project_id, status),
    KEY idx_tn_tasks_assignee (organization_id, assignee_id, status),
    CONSTRAINT fk_tn_tasks_org      FOREIGN KEY (organization_id)    REFERENCES organizations (id)    ON DELETE CASCADE,
    CONSTRAINT fk_tn_tasks_project  FOREIGN KEY (project_id)         REFERENCES teamnest_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_tn_tasks_assignee FOREIGN KEY (assignee_id)        REFERENCES users (id)            ON DELETE SET NULL,
    CONSTRAINT fk_tn_tasks_ticket   FOREIGN KEY (flowdesk_ticket_id) REFERENCES flowdesk_tickets (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- teamnest_time (time spent, billable once) -------------------------
CREATE TABLE IF NOT EXISTS teamnest_time (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    task_id           BIGINT UNSIGNED NOT NULL,
    user_id           BIGINT UNSIGNED NULL,
    minutes           INT UNSIGNED    NOT NULL,
    spent_on          DATE            NOT NULL,
    note              VARCHAR(200)    NULL,
    billed_invoice_id BIGINT UNSIGNED NULL,                  -- Facturo invoice; deleting the draft frees the time
    created_at        DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_tn_time_task (task_id),
    KEY idx_tn_time_billed (billed_invoice_id),
    CONSTRAINT fk_tn_time_task    FOREIGN KEY (task_id)           REFERENCES teamnest_tasks (id)     ON DELETE CASCADE,
    CONSTRAINT fk_tn_time_user    FOREIGN KEY (user_id)           REFERENCES users (id)              ON DELETE SET NULL,
    CONSTRAINT fk_tn_time_invoice FOREIGN KEY (billed_invoice_id) REFERENCES facturo_documents (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
