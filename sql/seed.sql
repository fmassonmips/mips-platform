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
