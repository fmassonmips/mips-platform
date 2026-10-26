<?php
/**
 * Application configuration.
 * Copy and edit this file per environment. Never commit real credentials.
 */
declare(strict_types=1);

return [
    'app' => [
        'name'    => 'MIPS Dashboard',
        // 'development' enables error display. Use 'production' on live servers.
        'env'     => 'production',
        // Public base URL, used to build links in emails (password reset).
        // Never derived from the request Host header (host header injection).
        'url'     => 'https://dashboard.example.com',
    ],

    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'mips_platform',
        'user'    => 'mips_user',
        'pass'    => 'change_me_in_production',
        'charset' => 'utf8mb4',
    ],

    'session' => [
        'name'         => 'MIPSSESSID',
        'lifetime'     => 0,        // 0 = until browser closes (cookie is session-scoped)
        'idle_timeout' => 1800,     // 30 min of inactivity = auto logout
        'path'         => '/',
        'domain'       => '',
        // MUST be true over HTTPS in production.
        'secure'       => true,
        'httponly'     => true,
        'samesite'     => 'Lax',    // 'Strict' is even safer if you don't use cross-site links
    ],

    'security' => [
        'password_min_length' => 8,
        // 32 random bytes, base64. Encrypts 2FA secrets. Generate with
        // tools/make_app_key.php. Changing it invalidates every enrolled 2FA.
        'app_key'             => '',
        // Roles that must enrol in two-factor authentication before using
        // any module. Users in these roles are sent to their account page.
        'require_2fa_roles'   => ['admin', 'finance'],
        'totp_issuer'         => 'MIPS Dashboard',
        'reset_token_minutes' => 60,
    ],

    'mail' => [
        // 'smtp' (recommended), 'mail' (PHP mail()), or 'log' (writes the
        // message to the PHP error log: development only, never in production).
        'transport'  => 'log',
        'from'       => 'no-reply@example.com',
        'from_name'  => 'MIPS Dashboard',
        'smtp' => [
            'host'       => 'localhost',
            'port'       => 587,
            'encryption' => 'tls',   // 'tls' (STARTTLS), 'ssl' (implicit TLS) or 'none'
            'username'   => '',
            'password'   => '',
            'timeout'    => 10,
        ],
    ],

    'rate_limit' => [
        'max_attempts'   => 5,     // failed attempts before blocking
        'window_seconds' => 900,   // sliding window = 15 minutes
    ],

    // Roles allowed on each module. 'admin' always passes.
    'access' => [
        'reporting' => ['admin', 'finance'],
        'billing'   => ['admin', 'finance'],
        'audit'     => ['admin'],
        'users'     => ['admin'],
        'merchants' => ['admin', 'finance'],
    ],

    'storage' => [
        // Must be outside the public web root and writable by PHP.
        'path'               => dirname(__DIR__) . '/storage',
        'max_document_bytes' => 20 * 1024 * 1024,
    ],

    'merchants' => [
        // Contracts ending (or whose notice deadline falls) within this many days are flagged.
        'contract_alert_days' => 90,
    ],

    // Roles an administrator can assign, in display order.
    'roles' => ['user', 'finance', 'admin'],

    'reporting' => [
        // Upload size is also capped by PHP's upload_max_filesize / post_max_size.
        'max_upload_bytes' => 64 * 1024 * 1024,
    ],

    'billing' => [
        // Mauritius standard VAT rate. Check whether commissions are VAT-able
        // for each merchant before issuing invoices.
        'vat_rate'       => 15.00,
        'invoice_prefix' => 'MIPS',
        'issuer' => [
            'name'    => 'MIPS',
            'address' => '',
            'brn'     => '',   // Business Registration Number
            'vat_no'  => '',
        ],
    ],
];
