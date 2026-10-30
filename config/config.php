<?php
/**
 * Application configuration: versioned defaults, no secrets.
 * Each server puts its own values (database, secret_key, SMTP, MRA…) in
 * config/config.local.php, which is not versioned and only lists what it
 * changes; see config/config.local.example.php.
 */
declare(strict_types=1);

return [
    'app' => [
        'name'    => 'MIPS Dashboard',
        // 'development' enables error display. Use 'production' on live servers.
        'env'     => 'production',
        // Public base URL, used in links sent by e-mail (no trailing slash).
        'url'     => 'https://my.mips.mu',
        // 32 random bytes, base64. Encrypts secrets stored in the database
        // (MRA passwords and session keys). Generate once per environment with:
        //   php -r 'echo base64_encode(random_bytes(32)), PHP_EOL;'
        // Changing it makes stored MRA passwords unreadable (re-enter them).
        'secret_key' => '',
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
    ],

    // Outgoing e-mail (SMTP). Leave 'host' empty to disable sending.
    'mail' => [
        'host'         => '',
        'port'         => 587,
        'encryption'   => 'tls',              // 'tls' (STARTTLS), 'ssl' (implicit TLS) or 'none'
        'username'     => '',
        'password'     => '',
        'from_address' => 'no-reply@mips.mu',
        'timeout'      => 15,
    ],

    // MRA e-invoicing. Defaults are the SANDBOX endpoints from the MRA Technical
    // Guidelines; take the LIVE URLs from the MRA e-Invoicing Developer Portal
    // once the EBS has passed its test drive.
    'mra' => [
        'auth_url'        => 'https://einvoice-sandbox.mra.mu/einvoice-token-service/token-api/generate-token',
        'transmit_url'    => 'https://einvoice-sandbox.mra.mu/realtime/invoice/transmit-simulation',
        // MRA public key downloaded from the Developer Portal (PEM public key or certificate).
        'public_key_file' => __DIR__ . '/mra_public_key.pem',
        'timeout'         => 20,
    ],

    // Subscriptions: e-mail shown to companies whose free trial is over ("Passer à l'abonnement").
    // Empty: they are told to contact MIPS.
    'billing' => [
        'contact_email' => '',
    ],

    // Bookora: calendars imported from Airbnb / Booking.com (iCal). Private
    // network addresses and plain http are refused unless allowed (local tests only).
    'bookora' => [
        'ical_allow_private' => false,
        'ical_timeout'       => 10,
    ],

    'rate_limit' => [
        'max_attempts'   => 5,     // failed attempts before blocking
        'window_seconds' => 900,   // sliding window = 15 minutes
    ],
];
