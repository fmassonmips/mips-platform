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

    'rate_limit' => [
        'max_attempts'   => 5,     // failed attempts before blocking
        'window_seconds' => 900,   // sliding window = 15 minutes
    ],
];
