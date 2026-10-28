-- ShopLokal: online shop (orders paid on delivery, by bank transfer or Juice).
-- Apply once on an existing database, after 013_teamnest.sql:
--   mysql -u root -p mips_platform < sql/migrations/014_shoplokal.sql

-- ---- shoplokal_settings (one row per org) -------------------------------
CREATE TABLE IF NOT EXISTS shoplokal_settings (
    organization_id    BIGINT UNSIGNED NOT NULL,
    public_token       CHAR(32)        NOT NULL,              -- shop link /shoplokal/s.php?o=…
    shop_open          TINYINT(1)      NOT NULL DEFAULT 0,    -- closed until the owner opens it
    intro              VARCHAR(500)    NULL,
    pay_cod            TINYINT(1)      NOT NULL DEFAULT 1,    -- cash on delivery / at pickup
    pay_bank           TINYINT(1)      NOT NULL DEFAULT 0,
    bank_details       VARCHAR(300)    NULL,                  -- shown after ordering
    pay_juice          TINYINT(1)      NOT NULL DEFAULT 0,
    juice_number       VARCHAR(40)     NULL,
    delivery_enabled   TINYINT(1)      NOT NULL DEFAULT 1,
    delivery_fee_cents BIGINT          NOT NULL DEFAULT 0,    -- excl. VAT, like product prices
    free_delivery_from_cents BIGINT    NULL,                  -- order total incl. VAT; NULL = never free
    pickup_enabled     TINYINT(1)      NOT NULL DEFAULT 1,
    pickup_address     VARCHAR(300)    NULL,
    notify_email       VARCHAR(254)    NULL,
    last_number        INT UNSIGNED    NOT NULL DEFAULT 0,    -- order numbering, gap-free
    PRIMARY KEY (organization_id),
    UNIQUE KEY uq_sl_settings_token (public_token),
    CONSTRAINT fk_sl_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- shoplokal_products ----------------------------------------------------
-- price_cents is excl. VAT with an MRA tax code, so an order totals exactly
-- like the Facturo invoice made from it.
CREATE TABLE IF NOT EXISTS shoplokal_products (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(150)    NOT NULL,
    description     VARCHAR(2000)   NULL,
    price_cents     BIGINT          NOT NULL,
    tax_code        VARCHAR(4)      NOT NULL DEFAULT 'TC03',
    stock           INT             NULL,                     -- NULL = not tracked
    image           MEDIUMTEXT      NULL,                     -- data:image/jpeg;base64,… (resized in the browser)
    active          TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_sl_products_org (organization_id, active, name),
    CONSTRAINT fk_sl_products_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- shoplokal_orders --------------------------------------------------------
-- All times are Mauritius local time, written by the application.
CREATE TABLE IF NOT EXISTS shoplokal_orders (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id    BIGINT UNSIGNED NOT NULL,
    number             INT UNSIGNED    NOT NULL,
    status             VARCHAR(10)     NOT NULL DEFAULT 'new',  -- new | confirmed | shipped | completed | cancelled
    paid_at            DATETIME        NULL,
    customer_name      VARCHAR(120)    NOT NULL,
    phone              VARCHAR(20)     NOT NULL,
    email              VARCHAR(254)    NULL,
    address            VARCHAR(500)    NULL,
    delivery_method    VARCHAR(8)      NOT NULL,                -- delivery | pickup
    payment_method     VARCHAR(8)      NOT NULL,                -- cod | bank | juice
    note               VARCHAR(500)    NULL,
    subtotal_cents     BIGINT          NOT NULL,                -- excl. VAT, delivery included
    tax_cents          BIGINT          NOT NULL,
    total_cents        BIGINT          NOT NULL,
    delivery_cents     BIGINT          NOT NULL DEFAULT 0,      -- excl. VAT
    token              CHAR(48)        NOT NULL,
    created_ip         VARCHAR(45)     NULL,
    facturo_invoice_id BIGINT UNSIGNED NULL,
    created_at         DATETIME        NOT NULL,
    updated_at         DATETIME        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sl_orders_number (organization_id, number),
    UNIQUE KEY uq_sl_orders_token (token),
    KEY idx_sl_orders_org_status (organization_id, status, id),
    KEY idx_sl_orders_ip (created_ip, created_at),
    CONSTRAINT fk_sl_orders_org     FOREIGN KEY (organization_id)    REFERENCES organizations (id)     ON DELETE CASCADE,
    CONSTRAINT fk_sl_orders_invoice FOREIGN KEY (facturo_invoice_id) REFERENCES facturo_documents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- shoplokal_order_lines (product details frozen at order time) -------
CREATE TABLE IF NOT EXISTS shoplokal_order_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id         BIGINT UNSIGNED NOT NULL,
    product_id       BIGINT UNSIGNED NULL,
    name             VARCHAR(150)    NOT NULL,
    unit_price_cents BIGINT          NOT NULL,                  -- excl. VAT
    tax_code         VARCHAR(4)      NOT NULL,
    quantity         INT UNSIGNED    NOT NULL,
    line_total_cents BIGINT          NOT NULL,                  -- excl. VAT
    line_tax_cents   BIGINT          NOT NULL,
    PRIMARY KEY (id),
    KEY idx_sl_lines_order (order_id),
    CONSTRAINT fk_sl_lines_order   FOREIGN KEY (order_id)   REFERENCES shoplokal_orders (id)   ON DELETE CASCADE,
    CONSTRAINT fk_sl_lines_product FOREIGN KEY (product_id) REFERENCES shoplokal_products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
