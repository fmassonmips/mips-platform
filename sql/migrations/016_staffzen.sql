-- StaffZen: leave requests, approvals, balances and team calendar.
-- Apply once on an existing database, after 015_team.sql:
--   mysql -u root -p mips_platform < sql/migrations/016_staffzen.sql
-- Leave is counted in half-days (2 = one working day) so half days stay exact.

-- ---- staffzen_settings (one row per org) ----------------------------------
CREATE TABLE IF NOT EXISTS staffzen_settings (
    organization_id BIGINT UNSIGNED NOT NULL,
    work_days       CHAR(7)         NOT NULL DEFAULT '1111100',   -- Monday … Sunday, 1 = worked
    PRIMARY KEY (organization_id),
    CONSTRAINT fk_sz_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- staffzen_leave_types --------------------------------------------------
CREATE TABLE IF NOT EXISTS staffzen_leave_types (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id     BIGINT UNSIGNED NOT NULL,
    name                VARCHAR(60)     NOT NULL,
    allowance_halfdays  INT             NULL,                  -- per person and year; NULL = not counted (unpaid…)
    active              TINYINT(1)      NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_sz_types_org (organization_id, active),
    CONSTRAINT fk_sz_types_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- staffzen_allowances (per-person override of a type's yearly allowance)
CREATE TABLE IF NOT EXISTS staffzen_allowances (
    type_id    BIGINT UNSIGNED NOT NULL,
    user_id    BIGINT UNSIGNED NOT NULL,
    year       SMALLINT        NOT NULL,
    halfdays   INT             NOT NULL,
    PRIMARY KEY (type_id, user_id, year),
    CONSTRAINT fk_sz_allow_type FOREIGN KEY (type_id) REFERENCES staffzen_leave_types (id) ON DELETE CASCADE,
    CONSTRAINT fk_sz_allow_user FOREIGN KEY (user_id) REFERENCES users (id)                ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- staffzen_holidays (public holidays, not counted as leave) -------------
CREATE TABLE IF NOT EXISTS staffzen_holidays (
    organization_id BIGINT UNSIGNED NOT NULL,
    day             DATE            NOT NULL,
    name            VARCHAR(80)     NOT NULL,
    PRIMARY KEY (organization_id, day),
    CONSTRAINT fk_sz_holidays_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- staffzen_requests ------------------------------------------------------
CREATE TABLE IF NOT EXISTS staffzen_requests (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,                  -- who is away
    type_id         BIGINT UNSIGNED NOT NULL,
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    half_day        CHAR(2)         NULL,                      -- am | pm, single-day requests only
    halfdays        INT             NOT NULL,                  -- counted at request time
    status          VARCHAR(10)     NOT NULL DEFAULT 'pending', -- pending | approved | refused | cancelled
    note            VARCHAR(500)    NULL,
    decision_note   VARCHAR(500)    NULL,
    decided_by      BIGINT UNSIGNED NULL,
    decided_at      DATETIME        NULL,
    created_by      BIGINT UNSIGNED NULL,                      -- a manager can record leave for someone
    created_at      DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_sz_req_user (organization_id, user_id, start_date),
    KEY idx_sz_req_status (organization_id, status, start_date),
    KEY idx_sz_req_dates (organization_id, start_date, end_date),
    CONSTRAINT fk_sz_req_org     FOREIGN KEY (organization_id) REFERENCES organizations (id)        ON DELETE CASCADE,
    CONSTRAINT fk_sz_req_user    FOREIGN KEY (user_id)         REFERENCES users (id)                ON DELETE CASCADE,
    CONSTRAINT fk_sz_req_type    FOREIGN KEY (type_id)         REFERENCES staffzen_leave_types (id),
    CONSTRAINT fk_sz_req_decider FOREIGN KEY (decided_by)      REFERENCES users (id)                ON DELETE SET NULL,
    CONSTRAINT fk_sz_req_creator FOREIGN KEY (created_by)      REFERENCES users (id)                ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
