-- -----------------------------------------------------------------------
-- Optional demo data for the CRM / policies / quotes modules.
--
-- Load AFTER schema.sql and seed.sql:
--     mysql -u root -p < sql/seed_demo.sql
--
-- Safe to re-run: rows use fixed ids with ON DUPLICATE KEY UPDATE.
-- All records are attributed to the seeded admin user (id = 1).
-- Dates are expressed relative to CURDATE() so the expiry alerts on the
-- dashboard stay meaningful over time.
-- -----------------------------------------------------------------------

USE mips_platform;

-- ---- clients -----------------------------------------------------------
INSERT INTO clients (id, type, name, email, phone, address, city, notes, created_by)
VALUES
    (1, 'company',    'Océan Indien Logistics Ltée', 'contact@oil.mu',   '+230 5 123 4567', 'Quai D, Port Area', 'Port Louis', 'Fleet & cargo cover.', 1),
    (2, 'individual', 'Priya Ramduth',               'priya.r@example.mu','+230 5 987 6543', 'Av. des Flamboyants',  'Curepipe',  'Family motor + home.', 1),
    (3, 'individual', 'Jean-Marc Lagesse',           'jm.lagesse@example.mu','+230 5 444 1212','Royal Road',         'Quatre Bornes', 'Life policy holder.', 1),
    (4, 'company',    'Tropic Hôtels Group',         'risk@tropic.mu',   '+230 2 111 2222', 'Coastal Road, Flic en Flac', 'Black River', 'Multi-site business cover.', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email);

-- ---- interactions ------------------------------------------------------
INSERT INTO client_interactions (id, client_id, user_id, type, summary, details, occurred_at)
VALUES
    (1, 1, 1, 'call',    'Discovery call',            'Discussed fleet of 18 vehicles and warehouse cover.', DATE_SUB(NOW(), INTERVAL 12 DAY)),
    (2, 1, 1, 'email',   'Sent fleet questionnaire',  'Awaiting completed schedule of vehicles.',            DATE_SUB(NOW(), INTERVAL 9 DAY)),
    (3, 2, 1, 'meeting', 'Renewal review',            'Reviewed motor + home renewal terms for the year.',   DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (4, 4, 1, 'note',    'Site list received',        'Three properties to be added to the master policy.',  DATE_SUB(NOW(), INTERVAL 2 DAY))
ON DUPLICATE KEY UPDATE summary = VALUES(summary);

-- ---- contracts / policies ---------------------------------------------
INSERT INTO contracts (id, client_id, policy_number, insurer, type, premium, commission_rate, start_date, end_date, status, notes, created_by)
VALUES
    (1, 1, 'POL-2026-0012', 'Swan General',    'business', 240000.00, 12.50, DATE_SUB(CURDATE(), INTERVAL 11 MONTH), DATE_ADD(CURDATE(), INTERVAL 25 DAY), 'active',  'Warehouse + fleet.', 1),
    (2, 2, 'POL-2026-0033', 'Mauritius Union', 'auto',      32000.00, 10.00, DATE_SUB(CURDATE(), INTERVAL 10 MONTH), DATE_ADD(CURDATE(), INTERVAL 55 DAY), 'active',  'Comprehensive motor.', 1),
    (3, 2, 'POL-2026-0034', 'Mauritius Union', 'home',      18500.00,  9.00, DATE_SUB(CURDATE(), INTERVAL 8 MONTH),  DATE_ADD(CURDATE(), INTERVAL 8 DAY),  'active',  'Building + contents.', 1),
    (4, 3, 'POL-2025-0901', 'SICOM Life',      'life',      54000.00, 15.00, DATE_SUB(CURDATE(), INTERVAL 14 MONTH), DATE_SUB(CURDATE(), INTERVAL 5 DAY),  'expired', 'Pending renewal.', 1),
    (5, 4, 'POL-2026-0050', 'La Prudence',     'business', 410000.00, 13.00, DATE_SUB(CURDATE(), INTERVAL 3 MONTH),  DATE_ADD(CURDATE(), INTERVAL 9 MONTH), 'active',  'Three-site cover.', 1)
ON DUPLICATE KEY UPDATE insurer = VALUES(insurer), premium = VALUES(premium), end_date = VALUES(end_date), status = VALUES(status);

-- ---- quotes / devis ----------------------------------------------------
INSERT INTO quotes (id, client_id, reference, type, details, estimated_premium, status, contract_id, created_by)
VALUES
    (1, 1, 'Q-2026-0001', 'Marine cargo',  'Annual open cover for sea freight.',          95000.00, 'in_progress', NULL, 1),
    (2, 2, 'Q-2026-0002', 'Travel',        'Family annual multi-trip.',                    7800.00, 'new',         NULL, 1),
    (3, 3, 'Q-2026-0003', 'Health',        'Top-up health plan for two.',                 42000.00, 'new',         NULL, 1),
    (4, 4, 'Q-2026-0004', 'Business interruption', 'Add-on to existing master policy.',  130000.00, 'converted',    5, 1)
ON DUPLICATE KEY UPDATE type = VALUES(type), estimated_premium = VALUES(estimated_premium), status = VALUES(status);
