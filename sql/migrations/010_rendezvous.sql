-- RendezVous: online appointment booking.
-- Apply once on an existing database, after 009_client_document_language.sql:
--   mysql -u root -p mips_platform < sql/migrations/010_rendezvous.sql

-- ---- rendezvous_settings (online booking rules, one row per org) --------
CREATE TABLE IF NOT EXISTS rendezvous_settings (
    organization_id   BIGINT UNSIGNED  NOT NULL,
    public_token      CHAR(32)         NOT NULL,                -- booking page link /rendezvous/book.php?o=…
    booking_enabled   TINYINT(1)       NOT NULL DEFAULT 1,
    slot_step_min     SMALLINT UNSIGNED NOT NULL DEFAULT 15,    -- start times offered every N minutes
    min_notice_min    INT UNSIGNED     NOT NULL DEFAULT 60,     -- earliest online booking from now
    max_days_ahead    SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    cancel_notice_min INT UNSIGNED     NOT NULL DEFAULT 120,    -- latest online cancellation before start
    notify_email      VARCHAR(254)     NULL,                    -- copy of every online booking / cancellation
    intro             VARCHAR(500)     NULL,                    -- text shown on the booking page
    updated_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id),
    UNIQUE KEY uq_rv_settings_token (public_token),
    CONSTRAINT fk_rv_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_services (what can be booked) ---------------------------
CREATE TABLE IF NOT EXISTS rendezvous_services (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED  NOT NULL,
    name            VARCHAR(120)     NOT NULL,
    duration_min    SMALLINT UNSIGNED NOT NULL,
    price_cents     BIGINT           NULL,                      -- shown on the booking page, MUR
    active          TINYINT(1)       NOT NULL DEFAULT 1,
    created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rv_services_org (organization_id, name),
    CONSTRAINT fk_rv_services_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_staff (people or resources with their own agenda) -------
CREATE TABLE IF NOT EXISTS rendezvous_staff (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(120)    NOT NULL,
    active          TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rv_staff_org (organization_id, name),
    CONSTRAINT fk_rv_staff_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_hours (weekly working hours, several ranges per day) ----
CREATE TABLE IF NOT EXISTS rendezvous_hours (
    staff_id   BIGINT UNSIGNED  NOT NULL,
    weekday    TINYINT UNSIGNED NOT NULL,                       -- 1 = Monday … 7 = Sunday
    start_time TIME             NOT NULL,
    end_time   TIME             NOT NULL,
    PRIMARY KEY (staff_id, weekday, start_time),
    CONSTRAINT fk_rv_hours_staff FOREIGN KEY (staff_id) REFERENCES rendezvous_staff (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- rendezvous_appointments --------------------------------------------
-- All times, created_at included, are local Mauritius time (UTC+4, no daylight
-- saving), written by the application.
CREATE TABLE IF NOT EXISTS rendezvous_appointments (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  BIGINT UNSIGNED NOT NULL,
    staff_id         BIGINT UNSIGNED NOT NULL,
    service_id       BIGINT UNSIGNED NOT NULL,
    starts_at        DATETIME        NOT NULL,
    ends_at          DATETIME        NOT NULL,
    status           VARCHAR(16)     NOT NULL DEFAULT 'booked', -- booked | done | no_show | cancelled
    customer_name    VARCHAR(120)    NOT NULL,
    phone            VARCHAR(20)     NULL,                      -- local format, as ClientBloom
    email            VARCHAR(254)    NULL,
    note             VARCHAR(500)    NULL,
    source           VARCHAR(8)      NOT NULL,                  -- online | staff
    token            CHAR(48)        NOT NULL,                  -- customer's manage link
    created_ip       VARCHAR(45)     NULL,
    reminder_sent_at DATETIME        NULL,
    cancelled_at     DATETIME        NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rv_appt_token (token),
    KEY idx_rv_appt_staff_time (staff_id, starts_at),
    KEY idx_rv_appt_org_time (organization_id, starts_at),
    KEY idx_rv_appt_ip (created_ip, created_at),
    CONSTRAINT fk_rv_appt_org     FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_rv_appt_staff   FOREIGN KEY (staff_id)        REFERENCES rendezvous_staff (id),
    CONSTRAINT fk_rv_appt_service FOREIGN KEY (service_id)      REFERENCES rendezvous_services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
