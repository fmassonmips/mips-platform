-- Bookora: nightly bookings for guesthouses, villas and bungalows.
-- Apply once on an existing database, after 016_staffzen.sql:
--   mysql -u root -p mips_platform < sql/migrations/017_bookora.sql
-- A stay is check_in (first night) to check_out (departure day, not a night).
-- Prices are per night excl. VAT with an MRA tax code, like ShopLokal, so a
-- booking and its Facturo invoice total the same.

-- ---- bookora_settings (one row per org) ------------------------------------
CREATE TABLE IF NOT EXISTS bookora_settings (
    organization_id BIGINT UNSIGNED NOT NULL,
    public_token    CHAR(32)        NOT NULL,                 -- booking page /bookora/s.php?o=…
    booking_open    TINYINT(1)      NOT NULL DEFAULT 0,       -- closed until the owner opens it
    intro           VARCHAR(500)    NULL,
    checkin_time    CHAR(5)         NOT NULL DEFAULT '14:00',
    checkout_time   CHAR(5)         NOT NULL DEFAULT '11:00',
    deposit_percent TINYINT UNSIGNED NOT NULL DEFAULT 30,     -- asked to confirm a booking; 0 = none
    hold_hours      SMALLINT UNSIGNED NOT NULL DEFAULT 72,    -- an unconfirmed request holds the dates this long
    bank_details    VARCHAR(300)    NULL,
    juice_number    VARCHAR(40)     NULL,
    notify_email    VARCHAR(254)    NULL,
    last_number     INT UNSIGNED    NOT NULL DEFAULT 0,       -- booking numbering, gap-free
    PRIMARY KEY (organization_id),
    UNIQUE KEY uq_bk_settings_token (public_token),
    CONSTRAINT fk_bk_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- bookora_units (rooms, bungalows, villas) --------------------------------
CREATE TABLE IF NOT EXISTS bookora_units (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(120)    NOT NULL,
    description     VARCHAR(2000)   NULL,
    capacity        TINYINT UNSIGNED NOT NULL DEFAULT 2,
    price_cents     BIGINT          NOT NULL,                 -- per night, excl. VAT
    tax_code        VARCHAR(4)      NOT NULL DEFAULT 'TC01',
    min_nights      TINYINT UNSIGNED NOT NULL DEFAULT 1,
    image           MEDIUMTEXT      NULL,                     -- data URL, shrunk in the browser
    active          TINYINT(1)      NOT NULL DEFAULT 1,
    ical_token      CHAR(32)        NOT NULL,                 -- export feed /bookora/ical.php?u=…
    ical_import_url VARCHAR(500)    NULL,                     -- Airbnb / Booking.com calendar
    ical_synced_at  DATETIME        NULL,
    ical_error      VARCHAR(300)    NULL,
    created_at      DATETIME        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bk_units_ical (ical_token),
    KEY idx_bk_units_org (organization_id, active, name),
    CONSTRAINT fk_bk_units_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- bookora_seasons (price per night over a date range) ------------------------
CREATE TABLE IF NOT EXISTS bookora_seasons (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    unit_id     BIGINT UNSIGNED NOT NULL,
    label       VARCHAR(60)     NOT NULL,
    start_date  DATE            NOT NULL,                     -- first night at this price
    end_date    DATE            NOT NULL,                     -- last night at this price (inclusive)
    price_cents BIGINT          NOT NULL,                     -- excl. VAT
    PRIMARY KEY (id),
    KEY idx_bk_seasons_unit (unit_id, start_date),
    CONSTRAINT fk_bk_seasons_unit FOREIGN KEY (unit_id) REFERENCES bookora_units (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- bookora_blocks (nights closed by the owner or by an imported calendar) ----
CREATE TABLE IF NOT EXISTS bookora_blocks (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    unit_id    BIGINT UNSIGNED NOT NULL,
    start_date DATE            NOT NULL,                      -- first closed night
    end_date   DATE            NOT NULL,                      -- day after the last closed night
    reason     VARCHAR(200)    NULL,
    source     VARCHAR(8)      NOT NULL DEFAULT 'manual',     -- manual | ical
    created_at DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_bk_blocks_unit (unit_id, start_date, end_date),
    CONSTRAINT fk_bk_blocks_unit FOREIGN KEY (unit_id) REFERENCES bookora_units (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- bookora_bookings --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookora_bookings (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id    BIGINT UNSIGNED NOT NULL,
    unit_id            BIGINT UNSIGNED NOT NULL,
    number             INT UNSIGNED    NOT NULL,
    guest_name         VARCHAR(120)    NOT NULL,
    phone              VARCHAR(40)     NOT NULL,
    email              VARCHAR(254)    NULL,
    guests             TINYINT UNSIGNED NOT NULL,
    check_in           DATE            NOT NULL,
    check_out          DATE            NOT NULL,
    nights             SMALLINT UNSIGNED NOT NULL,
    subtotal_cents     BIGINT          NOT NULL,              -- excl. VAT
    tax_cents          BIGINT          NOT NULL,
    total_cents        BIGINT          NOT NULL,
    deposit_cents      BIGINT          NOT NULL DEFAULT 0,
    status             VARCHAR(10)     NOT NULL DEFAULT 'new', -- new | confirmed | cancelled
    source             VARCHAR(8)      NOT NULL DEFAULT 'online', -- online | manual
    note               VARCHAR(500)    NULL,
    hold_until         DATETIME        NULL,                  -- a 'new' request blocks the dates until then
    deposit_paid_at    DATETIME        NULL,
    paid_at            DATETIME        NULL,                  -- paid in full
    facturo_invoice_id BIGINT UNSIGNED NULL,
    token              CHAR(48)        NOT NULL,              -- guest page /bookora/b.php?t=…
    created_ip         VARCHAR(45)     NULL,
    created_at         DATETIME        NOT NULL,
    updated_at         DATETIME        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bk_bookings_number (organization_id, number),
    UNIQUE KEY uq_bk_bookings_token (token),
    KEY idx_bk_bookings_unit (unit_id, status, check_in, check_out),
    KEY idx_bk_bookings_org (organization_id, status, check_in),
    KEY idx_bk_bookings_ip (created_ip, created_at),
    CONSTRAINT fk_bk_bookings_org     FOREIGN KEY (organization_id)    REFERENCES organizations (id)     ON DELETE CASCADE,
    CONSTRAINT fk_bk_bookings_unit    FOREIGN KEY (unit_id)            REFERENCES bookora_units (id),
    CONSTRAINT fk_bk_bookings_invoice FOREIGN KEY (facturo_invoice_id) REFERENCES facturo_documents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- bookora_booking_lines (nights grouped by price, frozen at booking time) ----
CREATE TABLE IF NOT EXISTS bookora_booking_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id       BIGINT UNSIGNED NOT NULL,
    description      VARCHAR(200)    NOT NULL,
    nights           SMALLINT UNSIGNED NOT NULL,
    unit_price_cents BIGINT          NOT NULL,                -- per night, excl. VAT
    tax_code         VARCHAR(4)      NOT NULL,
    line_total_cents BIGINT          NOT NULL,
    line_tax_cents   BIGINT          NOT NULL,
    PRIMARY KEY (id),
    KEY idx_bk_lines_booking (booking_id),
    CONSTRAINT fk_bk_lines_booking FOREIGN KEY (booking_id) REFERENCES bookora_bookings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
