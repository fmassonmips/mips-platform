-- =========================================================================
-- InsurLink MU — Marketplace Seed Data
-- Realistic motor insurance rate tables for Mauritius (illustrative)
--
-- Requires: sql/schema.sql + sql/seed.sql + sql/marketplace_schema.sql
-- =========================================================================

USE mips_platform;

-- =========================================================================
-- PLATFORM ADMIN USER
-- =========================================================================
INSERT INTO users (email, password_hash, name, role, is_active)
VALUES (
    'admin@insurlink.mu',
    '$2y$12$fkREcf4PDpT4qyHaUrWq1OMM8pPXISgFCQb2nCC/PAlIQ9JqkSlpe',  -- Admin123!
    'Platform Admin',
    'platform_admin',
    1
) ON DUPLICATE KEY UPDATE role = 'platform_admin', is_active = 1;

-- =========================================================================
-- RATE TABLES — SWAN INSURANCE (Motor Comprehensive)
-- =========================================================================

-- Get SWAN's motor comprehensive product ID (inserted by seed.sql)
SET @swan_motor_product_id = (
    SELECT ip.id FROM insurer_products ip
    JOIN insurers i ON i.id = ip.insurer_id
    WHERE i.short_code = 'swan' AND ip.product_type = 'motor'
      AND ip.product_name = 'Motor Comprehensive'
    LIMIT 1
);

SET @swan_insurer_id = (SELECT id FROM insurers WHERE short_code = 'swan' LIMIT 1);
SET @admin_user_id   = (SELECT id FROM users WHERE email = 'admin@insurlink.mu' LIMIT 1);

-- SWAN Motor Comprehensive — Rate Table 2026
INSERT INTO insurer_rate_tables (
    insurer_product_id, name, base_premium_annual, minimum_premium,
    acceptance_rules_json, valid_from, valid_to, is_active,
    submitted_by_insurer_id, approved_by_user_id, approved_at
) VALUES (
    @swan_motor_product_id,
    'SWAN Motor Comprehensive — Tarif 2026',
    8000.00,   -- MUR 8,000 base premium
    5500.00,   -- MUR 5,500 minimum
    JSON_OBJECT(
        'max_vehicle_age_years', 15,
        'min_sum_insured',        50000,
        'max_sum_insured',      2000000,
        'min_driver_age',          18
    ),
    '2026-01-01', NULL, 1,
    @swan_insurer_id, @admin_user_id, NOW()
);

SET @swan_motor_table_id = LAST_INSERT_ID();

-- Rating Factor 1: Vehicle Age (multiplier lookup)
INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@swan_motor_table_id, 'vehicle_age', 'Vehicle Age', 'Âge du Véhicule', 'lookup', 1,
 JSON_OBJECT(
     'input_field', 'vehicle.year',
     'apply_as', 'multiplier',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min', 2023, 'max', 2026, 'value', 1.00),
         JSON_OBJECT('min', 2020, 'max', 2022, 'value', 1.08),
         JSON_OBJECT('min', 2016, 'max', 2019, 'value', 1.18),
         JSON_OBJECT('min', 2012, 'max', 2015, 'value', 1.30),
         JSON_OBJECT('min', 2010, 'max', 2011, 'value', 1.45)
     )
 )
);

-- Rating Factor 2: Sum Insured (rate per 1,000 MUR of vehicle value)
INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@swan_motor_table_id, 'sum_insured_rate', 'Vehicle Value Rate', 'Taux Valeur Véhicule', 'lookup', 2,
 JSON_OBJECT(
     'input_field', 'vehicle.value',
     'apply_as', 'rate_per_1000',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min',      0, 'max',   250000, 'value', 18.00),
         JSON_OBJECT('min', 250001, 'max',   500000, 'value', 16.50),
         JSON_OBJECT('min', 500001, 'max',   750000, 'value', 15.00),
         JSON_OBJECT('min', 750001, 'max',  1000000, 'value', 14.00),
         JSON_OBJECT('min',1000001, 'max',  2000000, 'value', 12.50)
     )
 )
);

-- Rating Factor 3: Driver Age
INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@swan_motor_table_id, 'driver_age', 'Driver Age Loading', 'Majoration Âge Conducteur', 'lookup', 3,
 JSON_OBJECT(
     'input_field', 'driver.age',
     'apply_as', 'multiplier',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min', 18, 'max', 24, 'value', 1.35),
         JSON_OBJECT('min', 25, 'max', 29, 'value', 1.15),
         JSON_OBJECT('min', 30, 'max', 65, 'value', 1.00),
         JSON_OBJECT('min', 66, 'max', 75, 'value', 1.20)
     )
 )
);

-- Discount: No Claims Bonus (0 claims in last 3 years)
INSERT INTO rating_discounts (rate_table_id, discount_name, discount_label_en, discount_label_fr, discount_type, discount_value, condition_json, max_cumulative_pct) VALUES
(@swan_motor_table_id, 'no_claims_bonus', 'No Claims Bonus', 'Bonus Sans Sinistre', 'percentage', 20.00,
 JSON_OBJECT('field', 'driver.claims_last_3_years', 'operator', 'eq', 'value', 0),
 35.00
);

-- Discount: Experienced Driver (10+ years licence)
INSERT INTO rating_discounts (rate_table_id, discount_name, discount_label_en, discount_label_fr, discount_type, discount_value, condition_json, max_cumulative_pct) VALUES
(@swan_motor_table_id, 'experienced_driver', 'Experienced Driver', 'Conducteur Expérimenté', 'percentage', 8.00,
 JSON_OBJECT('field', 'driver.years_licensed', 'operator', 'gte', 'value', 10),
 35.00
);

-- =========================================================================
-- RATE TABLES — MUA INSURANCE (Motor Comprehensive Plus)
-- =========================================================================

SET @mua_motor_product_id = (
    SELECT ip.id FROM insurer_products ip
    JOIN insurers i ON i.id = ip.insurer_id
    WHERE i.short_code = 'mua' AND ip.product_name = 'Motor Comprehensive Plus'
    LIMIT 1
);
SET @mua_insurer_id = (SELECT id FROM insurers WHERE short_code = 'mua' LIMIT 1);

INSERT INTO insurer_rate_tables (
    insurer_product_id, name, base_premium_annual, minimum_premium,
    acceptance_rules_json, valid_from, valid_to, is_active,
    submitted_by_insurer_id, approved_by_user_id, approved_at
) VALUES (
    @mua_motor_product_id,
    'MUA Motor Comprehensive Plus — Tarif 2026',
    7500.00,
    5000.00,
    JSON_OBJECT(
        'max_vehicle_age_years', 12,
        'min_sum_insured',        60000,
        'max_sum_insured',      1800000,
        'min_driver_age',          18
    ),
    '2026-01-01', NULL, 1,
    @mua_insurer_id, @admin_user_id, NOW()
);

SET @mua_motor_table_id = LAST_INSERT_ID();

INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@mua_motor_table_id, 'vehicle_age', 'Vehicle Age', 'Âge du Véhicule', 'lookup', 1,
 JSON_OBJECT(
     'input_field', 'vehicle.year',
     'apply_as', 'multiplier',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min', 2023, 'max', 2026, 'value', 1.00),
         JSON_OBJECT('min', 2020, 'max', 2022, 'value', 1.10),
         JSON_OBJECT('min', 2016, 'max', 2019, 'value', 1.22),
         JSON_OBJECT('min', 2013, 'max', 2015, 'value', 1.38)
     )
 )
);

INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@mua_motor_table_id, 'sum_insured_rate', 'Vehicle Value Rate', 'Taux Valeur Véhicule', 'lookup', 2,
 JSON_OBJECT(
     'input_field', 'vehicle.value',
     'apply_as', 'rate_per_1000',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min',      0, 'max',   300000, 'value', 17.50),
         JSON_OBJECT('min', 300001, 'max',   600000, 'value', 16.00),
         JSON_OBJECT('min', 600001, 'max',  1000000, 'value', 14.50),
         JSON_OBJECT('min',1000001, 'max',  1800000, 'value', 13.00)
     )
 )
);

INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@mua_motor_table_id, 'driver_age', 'Driver Age Loading', 'Majoration Âge Conducteur', 'lookup', 3,
 JSON_OBJECT(
     'input_field', 'driver.age',
     'apply_as', 'multiplier',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min', 18, 'max', 24, 'value', 1.40),
         JSON_OBJECT('min', 25, 'max', 30, 'value', 1.12),
         JSON_OBJECT('min', 31, 'max', 65, 'value', 1.00),
         JSON_OBJECT('min', 66, 'max', 75, 'value', 1.18)
     )
 )
);

INSERT INTO rating_discounts (rate_table_id, discount_name, discount_label_en, discount_label_fr, discount_type, discount_value, condition_json, max_cumulative_pct) VALUES
(@mua_motor_table_id, 'no_claims_bonus', 'No Claims Bonus', 'Bonus Sans Sinistre', 'percentage', 25.00,
 JSON_OBJECT('field', 'driver.claims_last_3_years', 'operator', 'eq', 'value', 0), 40.00);

INSERT INTO rating_discounts (rate_table_id, discount_name, discount_label_en, discount_label_fr, discount_type, discount_value, condition_json, max_cumulative_pct) VALUES
(@mua_motor_table_id, 'multi_policy', 'Multi-Policy Discount', 'Remise Multi-Police', 'percentage', 7.00,
 JSON_OBJECT('field', 'client.has_existing_mua_policy', 'operator', 'eq', 'value', 1), 40.00);

-- =========================================================================
-- RATE TABLES — JUBILEE INSURANCE (Motor Comprehensive)
-- =========================================================================

SET @jubilee_motor_product_id = (
    SELECT ip.id FROM insurer_products ip
    JOIN insurers i ON i.id = ip.insurer_id
    WHERE i.short_code = 'jubilee' AND ip.product_type = 'motor'
    LIMIT 1
);
SET @jubilee_insurer_id = (SELECT id FROM insurers WHERE short_code = 'jubilee' LIMIT 1);

INSERT INTO insurer_rate_tables (
    insurer_product_id, name, base_premium_annual, minimum_premium,
    acceptance_rules_json, valid_from, valid_to, is_active,
    submitted_by_insurer_id, approved_by_user_id, approved_at
) VALUES (
    @jubilee_motor_product_id,
    'Jubilee Motor Comprehensive — Tarif 2026',
    7200.00,
    4800.00,
    JSON_OBJECT(
        'max_vehicle_age_years', 10,
        'min_sum_insured',        75000,
        'max_sum_insured',      1500000,
        'min_driver_age',          19
    ),
    '2026-01-01', NULL, 1,
    @jubilee_insurer_id, @admin_user_id, NOW()
);

SET @jubilee_motor_table_id = LAST_INSERT_ID();

INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@jubilee_motor_table_id, 'vehicle_age', 'Vehicle Age', 'Âge du Véhicule', 'lookup', 1,
 JSON_OBJECT(
     'input_field', 'vehicle.year',
     'apply_as', 'multiplier',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min', 2023, 'max', 2026, 'value', 1.00),
         JSON_OBJECT('min', 2020, 'max', 2022, 'value', 1.07),
         JSON_OBJECT('min', 2016, 'max', 2019, 'value', 1.15)
     )
 )
);

INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@jubilee_motor_table_id, 'sum_insured_rate', 'Vehicle Value Rate', 'Taux Valeur Véhicule', 'lookup', 2,
 JSON_OBJECT(
     'input_field', 'vehicle.value',
     'apply_as', 'rate_per_1000',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min',      0, 'max',   350000, 'value', 16.80),
         JSON_OBJECT('min', 350001, 'max',   700000, 'value', 15.50),
         JSON_OBJECT('min', 700001, 'max',  1500000, 'value', 14.20)
     )
 )
);

INSERT INTO rating_factors (rate_table_id, factor_name, factor_label_en, factor_label_fr, factor_type, apply_order, rules_json) VALUES
(@jubilee_motor_table_id, 'driver_age', 'Driver Age Loading', 'Majoration Âge Conducteur', 'lookup', 3,
 JSON_OBJECT(
     'input_field', 'driver.age',
     'apply_as', 'multiplier',
     'brackets', JSON_ARRAY(
         JSON_OBJECT('min', 19, 'max', 25, 'value', 1.30),
         JSON_OBJECT('min', 26, 'max', 65, 'value', 1.00),
         JSON_OBJECT('min', 66, 'max', 75, 'value', 1.15)
     )
 )
);

INSERT INTO rating_discounts (rate_table_id, discount_name, discount_label_en, discount_label_fr, discount_type, discount_value, condition_json, max_cumulative_pct) VALUES
(@jubilee_motor_table_id, 'no_claims_bonus', 'No Claims Bonus', 'Bonus Sans Sinistre', 'percentage', 22.00,
 JSON_OBJECT('field', 'driver.claims_last_3_years', 'operator', 'eq', 'value', 0), 35.00);

-- =========================================================================
-- PLATFORM COMMISSION STRUCTURE
-- =========================================================================

-- Lead shown: free for all insurers (encourages adoption)
-- Lead selected: MUR 50 per selection
-- Policy placed: 0.5% of premium

INSERT INTO platform_commissions (insurer_id, insurer_product_id, commission_type, commission_value, value_type, effective_from) VALUES
(@swan_insurer_id,    NULL, 'per_lead_selected',   50.00, 'fixed_mur',    '2026-01-01'),
(@swan_insurer_id,    NULL, 'per_policy_placed',    0.50,  'percentage',   '2026-01-01'),
(@mua_insurer_id,     NULL, 'per_lead_selected',   50.00, 'fixed_mur',    '2026-01-01'),
(@mua_insurer_id,     NULL, 'per_policy_placed',    0.50,  'percentage',   '2026-01-01'),
(@jubilee_insurer_id, NULL, 'per_lead_selected',   50.00, 'fixed_mur',    '2026-01-01'),
(@jubilee_insurer_id, NULL, 'per_policy_placed',    0.50,  'percentage',   '2026-01-01');
