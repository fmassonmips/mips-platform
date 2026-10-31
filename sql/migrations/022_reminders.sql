-- Automatic e-mails: end-of-trial reminders, welcome, overdue invoice reminders.
-- Apply once on an existing database, after 021_onboarding.sql:
--   mysql -u root -p mips_platform < sql/migrations/022_reminders.sql

-- Facturo: overdue invoices reminded from this date on (NULL = off). Only invoices
-- falling due after it are reminded, so switching on does not mail old invoices.
ALTER TABLE organizations ADD COLUMN facturo_reminders_since DATETIME NULL AFTER onboarded_at;

-- ---- notification_log (each automatic e-mail sent once) ----------------------
CREATE TABLE IF NOT EXISTS notification_log (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    kind            VARCHAR(20)     NOT NULL,          -- trial_7 | trial_1 | trial_end | welcome | invoice_1 | invoice_2
    ref             VARCHAR(80)     NOT NULL,          -- app + trial end, user id, document id
    sent_at         DATETIME        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification (organization_id, kind, ref),
    CONSTRAINT fk_notification_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
