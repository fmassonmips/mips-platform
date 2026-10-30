<?php
/**
 * Per-server settings, merged over config/config.php. Copy to
 * config/config.local.php (never committed), fill in, chmod 640, owner = the
 * PHP user. Only list what changes.
 */
declare(strict_types=1);

return [
    'app' => [
        'url'        => 'https://my.mips.mu',
        // php -r 'echo base64_encode(random_bytes(32)), PHP_EOL;'   — keep a copy in the password safe:
        // losing it makes the stored MRA passwords unreadable.
        'secret_key' => '',
    ],
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'mips_platform',
        'user' => 'mips_app',
        'pass' => '',
    ],
    'mail' => [
        'host'         => 'smtp-relay.example.com',
        'port'         => 587,
        'encryption'   => 'tls',
        'username'     => '',
        'password'     => '',
        'from_address' => 'no-reply@mips.mu',
    ],
    'mra' => [
        // LIVE URLs from the MRA e-Invoicing Developer Portal once the test drive is passed.
        'auth_url'     => '',
        'transmit_url' => '',
    ],
    'billing' => [
        'contact_email' => '',
    ],
    'legal' => [
        'draft'         => true,   // false once a lawyer has validated /cgu.php and /confidentialite.php
        'company'       => '',
        'address'       => '',
        'brn'           => '',
        'contact_email' => '',
        'privacy_email' => '',
        'host'          => '',
        'mail_provider' => '',
    ],
    'backoffice' => [
        // MIPS team accounts allowed in the back-office (their own MIPS login).
        'staff' => [/* 'prenom@mips.mu', */],
    ],
];
