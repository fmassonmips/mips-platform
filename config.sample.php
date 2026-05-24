<?php
/**
 * InsurLink MU — Configuration template
 *
 * USAGE:
 *   cp config.sample.php config/config.php
 *   # Then edit config/config.php with your real values.
 *
 * IMPORTANT: Never commit config/config.php (it contains credentials).
 *            config.sample.php is safe to commit — it holds no secrets.
 */
declare(strict_types=1);

return [

    // ── Application ──────────────────────────────────────────────────────────
    'app' => [
        'name'     => 'InsurLink MU',
        // 'development' turns on error display; use 'production' on live servers
        'env'      => 'production',
        'url'      => 'https://yourdomain.com',   // no trailing slash
        'timezone' => 'Indian/Mauritius',
    ],

    // ── Database (MariaDB / MySQL) ────────────────────────────────────────────
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'your_db_name',
        'user'    => 'your_db_user',
        'pass'    => 'your_db_password',
        'charset' => 'utf8mb4',
    ],

    // ── Session ───────────────────────────────────────────────────────────────
    'session' => [
        'name'         => 'INSURLINKSESSID',
        'lifetime'     => 0,       // 0 = session cookie (expires when browser closes)
        'idle_timeout' => 1800,    // seconds of inactivity before auto-logout (30 min)
        'path'         => '/',
        'domain'       => '',      // leave blank to use the current domain
        'secure'       => true,    // MUST be true in production (HTTPS only)
        'httponly'     => true,
        'samesite'     => 'Lax',   // 'Strict' is safer if no cross-site links needed
    ],

    // ── Security ──────────────────────────────────────────────────────────────
    'security' => [
        'password_min_length' => 8,
    ],

    // ── Rate limiting (login / sensitive endpoints) ───────────────────────────
    'rate_limit' => [
        'max_attempts'  => 5,    // failed attempts before blocking
        'decay_seconds' => 300,  // lockout window in seconds (5 minutes)
    ],

    // ── MIPS payment gateway ──────────────────────────────────────────────────
    'mips' => [
        'api_url'     => 'https://api.mips.mu/v1',
        'merchant_id' => '',   // your MIPS merchant ID
        'api_key'     => '',   // your MIPS API key — keep secret
    ],

    // ── SMTP / email ──────────────────────────────────────────────────────────
    // mail_driver: 'mail' uses PHP's built-in mail(); 'smtp' uses SMTP settings below.
    'mail_driver' => 'mail',   // options: 'mail', 'smtp'

    'smtp' => [
        'host'       => 'localhost',
        'port'       => 587,
        'user'       => '',              // SMTP username
        'pass'       => '',              // SMTP password — keep secret
        'from'       => '',              // sender address, e.g. no-reply@yourdomain.com
        'from_name'  => 'InsurLink MU',
        'encryption' => 'tls',           // 'tls' (STARTTLS on 587) or 'ssl' (port 465)
    ],

    // ── WhatsApp Business API (Meta) ──────────────────────────────────────────
    'whatsapp' => [
        'access_token'    => '',   // Meta permanent / temporary access token
        'phone_number_id' => '',   // WhatsApp Business phone number ID
    ],

];
