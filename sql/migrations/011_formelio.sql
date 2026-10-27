-- Formelio: forms and surveys, and the RendezVous satisfaction survey.
-- Apply once on an existing database, after 010_rendezvous.sql:
--   mysql -u root -p mips_platform < sql/migrations/011_formelio.sql

-- ---- formelio_forms (forms and surveys) ---------------------------------
-- fields: JSON list of {id, type, label, required, options[]}; ids are stable
-- ("f1", "f2", …) so answers stay attached when a form is edited.
CREATE TABLE IF NOT EXISTS formelio_forms (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    title           VARCHAR(200)    NOT NULL,
    description     VARCHAR(1000)   NULL,
    fields          MEDIUMTEXT      NOT NULL,
    status          VARCHAR(8)      NOT NULL DEFAULT 'draft',  -- draft | open | closed
    public_token    CHAR(32)        NOT NULL,                  -- /formelio/f.php?t=…
    thank_you       VARCHAR(500)    NULL,
    notify_email    VARCHAR(254)    NULL,                      -- e-mail on each response
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_formelio_forms_token (public_token),
    KEY idx_formelio_forms_org (organization_id, id),
    CONSTRAINT fk_formelio_forms_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- formelio_responses --------------------------------------------------
-- answers: JSON list of {id, label, type, value}: the label is kept as asked,
-- so a response stays readable after the form changes.
CREATE TABLE IF NOT EXISTS formelio_responses (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id BIGINT UNSIGNED NOT NULL,
    form_id         BIGINT UNSIGNED NOT NULL,
    answers         MEDIUMTEXT      NOT NULL,
    source          VARCHAR(16)     NULL,                      -- e.g. rendezvous:<appointment id>
    created_ip      VARCHAR(45)     NULL,
    created_at      DATETIME        NOT NULL,                  -- Mauritius local time, written by the application
    PRIMARY KEY (id),
    KEY idx_formelio_resp_form (form_id, id),
    KEY idx_formelio_resp_ip (created_ip, created_at),
    CONSTRAINT fk_formelio_resp_org  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_formelio_resp_form FOREIGN KEY (form_id)         REFERENCES formelio_forms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- RendezVous → Formelio: satisfaction survey after an honoured appointment
ALTER TABLE rendezvous_settings
    ADD COLUMN survey_form_id BIGINT UNSIGNED NULL AFTER intro,
    ADD CONSTRAINT fk_rv_settings_survey FOREIGN KEY (survey_form_id) REFERENCES formelio_forms (id) ON DELETE SET NULL;
ALTER TABLE rendezvous_appointments
    ADD COLUMN survey_sent_at DATETIME NULL AFTER reminder_sent_at;
