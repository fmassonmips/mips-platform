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

    // Inflow server-to-server (S2S) payments.
    // See: https://docs.inflowpay.com/docs/server-to-server-payments
    //
    // The API key is a live secret — it is read from the environment so it
    // is NEVER committed to the repository. Provision INFLOW_API_KEY in the
    // server/process environment (e.g. via your process manager or .env loader).
    'inflow' => [
        'api_key'              => getenv('INFLOW_API_KEY') ?: '',
        // PCI-scoped endpoint that receives card data (payment creation).
        'card_base_url'        => getenv('INFLOW_CARD_BASE_URL') ?: 'https://api-card.inflowpay.com',
        // Main API used for confirmation and status lookups.
        'api_base_url'         => getenv('INFLOW_API_BASE_URL') ?: 'https://api.inflowpay.xyz',
        // Where the customer is returned after 3-D Secure authentication.
        'three_ds_success_url' => getenv('INFLOW_3DS_SUCCESS_URL') ?: '',
        'three_ds_failure_url' => getenv('INFLOW_3DS_FAILURE_URL') ?: '',
        // Outbound HTTP timeout, in seconds.
        'timeout'              => 30,
        // Minimum charge per currency, in minor units (cents), as documented.
        'min_amount_cents'     => [
            'EUR' => 150,
            'USD' => 200,
        ],
    ],
];
