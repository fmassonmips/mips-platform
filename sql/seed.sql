-- -----------------------------------------------------------------------
-- Seed data — single test user.
--
-- Credentials:
--     email    : admin@example.com
--     password : Admin123!
--
-- The password hash below is a real bcrypt (cost 12) value for "Admin123!"
-- generated with:
--     php -r 'echo password_hash("Admin123!", PASSWORD_DEFAULT);'
--
-- Regenerate with tools/make_password_hash.php if you want a different one.
-- -----------------------------------------------------------------------

USE mips_platform;

INSERT INTO users (email, password_hash, name, role, is_active)
VALUES (
    'admin@example.com',
    '$2y$12$fkREcf4PDpT4qyHaUrWq1OMM8pPXISgFCQb2nCC/PAlIQ9JqkSlpe',
    'Admin',
    'admin',
    1
)
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    name          = VALUES(name),
    role          = VALUES(role),
    is_active     = VALUES(is_active);

-- =========================================================================
-- INSURANCE BROKER PLATFORM — seed data
-- =========================================================================

-- ---- insurers ------------------------------------------------------------
INSERT INTO insurers (name, short_code, is_active) VALUES
    ('SWAN Insurance',         'swan',    1),
    ('MUA Insurance',          'mua',     1),
    ('Jubilee Insurance',      'jubilee', 1),
    ('CIM Finance',            'cim',     1),
    ('Anglo-Mauritius (AML)',  'aml',     1),
    ('BAI Co (Bramer)',        'bai',     1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

-- ---- insurer_products ----------------------------------------------------
INSERT INTO insurer_products (insurer_id, product_type, product_name, is_active)
SELECT i.id, 'motor',     'Motor Comprehensive',           1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'motor',     'Motor Third Party',             1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'property',  'Homeowners All-Risk',           1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'health',    'SmartCare Health Plan',         1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'liability', 'Professional Indemnity',        1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'marine',    'Cargo Marine Transit',          1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'fleet',     'Fleet Comprehensive',           1 FROM insurers i WHERE i.short_code = 'swan'
UNION ALL
SELECT i.id, 'motor',     'Motor Comprehensive Plus',      1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'motor',     'Motor Third Party Fire & Theft',1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'property',  'Property All Risks',            1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'life',      'Term Life Assurance',           1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'health',    'MUA Health Shield',             1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'liability', 'Employers Liability',           1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'fleet',     'Fleet Third Party',             1 FROM insurers i WHERE i.short_code = 'mua'
UNION ALL
SELECT i.id, 'motor',     'Motor Comprehensive',           1 FROM insurers i WHERE i.short_code = 'jubilee'
UNION ALL
SELECT i.id, 'property',  'Fire & Allied Perils',          1 FROM insurers i WHERE i.short_code = 'jubilee'
UNION ALL
SELECT i.id, 'liability', 'Public Liability',              1 FROM insurers i WHERE i.short_code = 'jubilee'
UNION ALL
SELECT i.id, 'marine',    'Hull & Machinery',              1 FROM insurers i WHERE i.short_code = 'jubilee'
UNION ALL
SELECT i.id, 'fleet',     'Fleet Comprehensive',           1 FROM insurers i WHERE i.short_code = 'jubilee'
UNION ALL
SELECT i.id, 'motor',     'Motor Comprehensive',           1 FROM insurers i WHERE i.short_code = 'cim'
UNION ALL
SELECT i.id, 'life',      'Whole Life Policy',             1 FROM insurers i WHERE i.short_code = 'aml'
UNION ALL
SELECT i.id, 'health',    'Group Health Cover',            1 FROM insurers i WHERE i.short_code = 'aml';

-- ---- notification_templates (English) ------------------------------------
INSERT INTO notification_templates (template_key, channel, language, subject, body_template, variables_json, is_active) VALUES

-- Renewal J-45 — Email (EN)
('renewal_j45', 'email', 'en',
 'Your {{policy_type}} policy renews in 45 days — act now',
 'Dear {{client_name}},\n\nYour {{policy_type}} policy (No. {{policy_number}}) with {{insurer_name}} is due for renewal on {{expiry_date}}.\n\nTo ensure uninterrupted coverage, please renew your policy before {{expiry_date}}.\n\nRenewal premium: MUR {{premium_amount}}\n\nPay securely now via MIPS:\n{{payment_link}}\n\nAlternatively, contact your broker {{agent_name}} on {{agent_phone}} to discuss your renewal options.\n\nKind regards,\n{{brokerage_name}}',
 '["client_name","policy_type","policy_number","insurer_name","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Renewal J-30 — Email (EN)
('renewal_j30', 'email', 'en',
 'REMINDER: Your {{policy_type}} policy expires in 30 days',
 'Dear {{client_name}},\n\nThis is a reminder that your {{policy_type}} policy (No. {{policy_number}}) with {{insurer_name}} expires on {{expiry_date}} — just 30 days away.\n\nAvoid a coverage gap. Pay your renewal premium of MUR {{premium_amount}} today:\n{{payment_link}}\n\nFor questions, call {{agent_name}} on {{agent_phone}}.\n\n{{brokerage_name}}',
 '["client_name","policy_type","policy_number","insurer_name","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Renewal J-15 — Email (EN)
('renewal_j15', 'email', 'en',
 'URGENT: 15 days left to renew your {{policy_type}} policy',
 'Dear {{client_name}},\n\nUrgent: Your {{policy_type}} policy (No. {{policy_number}}) expires in 15 days on {{expiry_date}}.\n\nAfter this date, you will NO LONGER BE COVERED.\n\nRenew now — MUR {{premium_amount}}:\n{{payment_link}}\n\nPlease do not delay. Contact us immediately if you have any concerns:\n{{agent_name}} | {{agent_phone}} | {{agent_email}}\n\n{{brokerage_name}}',
 '["client_name","policy_type","policy_number","insurer_name","expiry_date","premium_amount","payment_link","agent_name","agent_phone","agent_email","brokerage_name"]',
 1),

-- Renewal J-0 — Email (EN, lapse notification)
('renewal_j0', 'email', 'en',
 'Your policy has lapsed — contact us immediately',
 'Dear {{client_name}},\n\nWe regret to inform you that your {{policy_type}} policy (No. {{policy_number}}) expired today, {{expiry_date}}, and is no longer active.\n\nYou are currently WITHOUT COVERAGE.\n\nPlease contact your broker {{agent_name}} immediately on {{agent_phone}} or {{agent_email}} to reinstate your policy.\n\n{{brokerage_name}}',
 '["client_name","policy_type","policy_number","expiry_date","agent_name","agent_phone","agent_email","brokerage_name"]',
 1),

-- Renewal J-45 — WhatsApp (EN)
('renewal_j45', 'whatsapp', 'en',
 NULL,
 'Hello {{client_name}} 👋\n\nYour *{{policy_type}}* policy ({{insurer_name}}) renews on *{{expiry_date}}*.\n\n💳 Pay MUR {{premium_amount}} securely:\n{{payment_link}}\n\nQuestions? Call {{agent_name}} on {{agent_phone}}.\n\n_{{brokerage_name}}_',
 '["client_name","policy_type","insurer_name","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Renewal J-30 — WhatsApp (EN)
('renewal_j30', 'whatsapp', 'en',
 NULL,
 'Hi {{client_name}} ⚠️\n\nReminder: Your *{{policy_type}}* policy expires in *30 days* on {{expiry_date}}.\n\nRenew now to stay covered:\n💳 MUR {{premium_amount}} → {{payment_link}}\n\n{{agent_name}} | {{agent_phone}}\n_{{brokerage_name}}_',
 '["client_name","policy_type","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Renewal J-15 — WhatsApp (EN)
('renewal_j15', 'whatsapp', 'en',
 NULL,
 '🚨 URGENT — {{client_name}}\n\nYour *{{policy_type}}* policy expires in *15 DAYS* ({{expiry_date}}).\n\nDo not drive/operate uninsured. Renew immediately:\n💳 MUR {{premium_amount}} → {{payment_link}}\n\nCall now: {{agent_name}} {{agent_phone}}\n_{{brokerage_name}}_',
 '["client_name","policy_type","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Appointment confirmation — Email (EN)
('appointment_confirm', 'email', 'en',
 'Appointment confirmed — {{appointment_type}} on {{appointment_date}}',
 'Dear {{client_name}},\n\nYour appointment has been confirmed:\n\nType: {{appointment_type}}\nDate: {{appointment_date}}\nTime: {{appointment_time}}\nFormat: {{format}}\n{{location_or_video_line}}\n\nYour broker: {{agent_name}} ({{agent_phone}})\n\nPlease ensure you have the following ready:\n{{preparation_notes}}\n\nTo reschedule, contact us on {{agent_phone}}.\n\n{{brokerage_name}}',
 '["client_name","appointment_type","appointment_date","appointment_time","format","location_or_video_line","agent_name","agent_phone","preparation_notes","brokerage_name"]',
 1),

-- Appointment reminder — WhatsApp (EN)
('appointment_reminder', 'whatsapp', 'en',
 NULL,
 'Hi {{client_name}} 📅\n\nReminder: Your *{{appointment_type}}* is tomorrow at *{{appointment_time}}*.\n\n{{location_or_video_line}}\n\nSee you then!\n{{agent_name}} | {{brokerage_name}}',
 '["client_name","appointment_type","appointment_time","location_or_video_line","agent_name","brokerage_name"]',
 1),

-- Payment receipt — Email (EN)
('payment_receipt', 'email', 'en',
 'Payment received — {{policy_type}} policy renewal',
 'Dear {{client_name}},\n\nThank you! We have received your payment of MUR {{amount_paid}} for your {{policy_type}} policy renewal.\n\nPolicy No.: {{policy_number}}\nInsurer: {{insurer_name}}\nNew cover period: {{new_start_date}} to {{new_end_date}}\nMIPS reference: {{mips_reference}}\n\nYour renewed policy schedule will be sent to you within 3 working days.\n\nThank you for choosing {{brokerage_name}}.\n\n{{agent_name}} | {{agent_phone}}',
 '["client_name","amount_paid","policy_type","policy_number","insurer_name","new_start_date","new_end_date","mips_reference","brokerage_name","agent_name","agent_phone"]',
 1);

-- ---- notification_templates (French) -------------------------------------
INSERT INTO notification_templates (template_key, channel, language, subject, body_template, variables_json, is_active) VALUES

-- Renewal J-45 — Email (FR)
('renewal_j45', 'email', 'fr',
 'Votre police {{policy_type}} arrive à échéance dans 45 jours',
 'Cher(e) {{client_name}},\n\nVotre police {{policy_type}} (N° {{policy_number}}) auprès de {{insurer_name}} arrive à échéance le {{expiry_date}}.\n\nPour garantir la continuité de votre couverture, veuillez renouveler votre police avant cette date.\n\nPrime de renouvellement : MUR {{premium_amount}}\n\nPayez en toute sécurité via MIPS :\n{{payment_link}}\n\nPour toute question, contactez votre courtier {{agent_name}} au {{agent_phone}}.\n\nCordialement,\n{{brokerage_name}}',
 '["client_name","policy_type","policy_number","insurer_name","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Renewal J-45 — WhatsApp (FR)
('renewal_j45', 'whatsapp', 'fr',
 NULL,
 'Bonjour {{client_name}} 👋\n\nVotre police *{{policy_type}}* ({{insurer_name}}) expire le *{{expiry_date}}*.\n\n💳 Renouvelez maintenant — MUR {{premium_amount}} :\n{{payment_link}}\n\nQuestions ? Appelez {{agent_name}} au {{agent_phone}}.\n_{{brokerage_name}}_',
 '["client_name","policy_type","insurer_name","expiry_date","premium_amount","payment_link","agent_name","agent_phone","brokerage_name"]',
 1),

-- Payment receipt — Email (FR)
('payment_receipt', 'email', 'fr',
 'Paiement reçu — renouvellement de votre police {{policy_type}}',
 'Cher(e) {{client_name}},\n\nNous accusons réception de votre paiement de MUR {{amount_paid}} pour le renouvellement de votre police {{policy_type}}.\n\nN° de police : {{policy_number}}\nAssureur : {{insurer_name}}\nNouvelle période de couverture : {{new_start_date}} au {{new_end_date}}\nRéférence MIPS : {{mips_reference}}\n\nMerci de votre confiance.\n\n{{agent_name}} | {{brokerage_name}}',
 '["client_name","amount_paid","policy_type","policy_number","insurer_name","new_start_date","new_end_date","mips_reference","brokerage_name","agent_name"]',
 1);
