<?php
/**
 * Application configuration.
 * Copy and edit this file per environment. Never commit real credentials.
 */
declare(strict_types=1);

/**
 * Small env helper: prefer real environment variables (set these in production
 * via the web server / container), fall back to the provided default for local
 * sandbox use. Secrets must never be committed — only their defaults-for-dev.
 */
$env = static function (string $key, string|int|bool|null $default = null): string|int|bool|null {
    $value = getenv($key);
    return $value === false ? $default : $value;
};

return [
    'app' => [
        'name'    => 'PassPass — MIPS Platform',
        // 'development' enables error display. Use 'production' on live servers.
        'env'     => $env('APP_ENV', 'production'),
    ],

    // -------------------------------------------------------------------
    // Regulatory / entity configuration.
    // PassPass is the regulated PSP; MIPSIT Digital Ltd is the technology
    // provider. The platform must NEVER represent MIPS as a licensed PSP.
    // -------------------------------------------------------------------
    'platform' => [
        'regulated_entity'      => $env('REGULATED_ENTITY', 'PassPass'),
        'regulated_entity_full' => 'PassPass Ltd',
        'technology_provider'   => $env('TECHNOLOGY_PROVIDER', 'MIPSIT Digital Ltd'),
        'partner_bank'          => $env('PARTNER_BANK', 'Partner Bank'),
        'jurisdiction'          => 'Mauritius',
        'base_currency'         => 'MUR',
        // Sandbox = prototype. Nothing here implies a live licence or approval.
        'sandbox'               => (bool) $env('PLATFORM_SANDBOX', true),
        // Shown on all compliance-related screens; configurable per environment.
        'legal_disclaimer'      =>
            'This is a sandbox/prototype of a payment platform. PassPass Ltd is '
            . 'the regulated payment service provider; MIPSIT Digital Ltd is the '
            . 'technology and orchestration provider. No entity is represented as '
            . 'licensed, approved or operational unless explicitly configured.',
    ],

    // -------------------------------------------------------------------
    // Provider adapters. Secrets come from the environment in production.
    // mode: 'sandbox' | 'live' (cardrail uses 'stub').
    // -------------------------------------------------------------------
    'providers' => [
        'passpass' => [
            'enabled'        => (bool)   $env('PASSPASS_ENABLED', true),
            'mode'           => (string) $env('PASSPASS_MODE', 'sandbox'),
            'base_url'       => (string) $env('PASSPASS_BASE_URL', ''),
            'api_key'        => (string) $env('PASSPASS_API_KEY', ''),
            'webhook_secret' => (string) $env('PASSPASS_WEBHOOK_SECRET', ''),
        ],
        'paypump' => [
            'enabled'        => (bool)   $env('PAYPUMP_ENABLED', true),
            'mode'           => (string) $env('PAYPUMP_MODE', 'sandbox'),
            'base_url'       => (string) $env('PAYPUMP_BASE_URL', ''),
            'api_key'        => (string) $env('PAYPUMP_API_KEY', ''),
            'webhook_secret' => (string) $env('PAYPUMP_WEBHOOK_SECRET', ''),
        ],
        'inflow' => [
            'enabled'        => (bool)   $env('INFLOW_ENABLED', true),
            'mode'           => (string) $env('INFLOW_MODE', 'sandbox'),
            'base_url'       => (string) $env('INFLOW_BASE_URL', ''),
            'api_key'        => (string) $env('INFLOW_API_KEY', ''),
            'webhook_secret' => (string) $env('INFLOW_WEBHOOK_SECRET', ''),
        ],
        'cardrail' => [
            'enabled'        => (bool)   $env('CARDRAIL_ENABLED', true),
            'mode'           => 'stub', // never 'live' in the MVP — no PCI scope
            'webhook_secret' => '',
        ],
    ],

    // -------------------------------------------------------------------
    // Routing engine. Maps a payment TYPE to a provider key. Admin-editable
    // in production via the payment_routes table; this is the bootstrap default.
    // -------------------------------------------------------------------
    'routing' => [
        'rules' => [
            'BANK_TRANSFER'      => 'passpass',
            'QR'                 => 'passpass',
            'PAYMENT_LINK'       => 'passpass',
            'VIRTUAL_CREDENTIAL' => 'passpass',
            'PAYPUMP_TRANSFER'   => 'paypump',
            'WORKFLOW'           => 'inflow',
            'CARD'               => 'cardrail',
        ],
        // Fallback resolution order when no explicit rule matches.
        'priority' => ['passpass', 'paypump', 'inflow', 'cardrail'],
        'default'  => 'passpass',
    ],

    'db' => [
        'host'    => (string) $env('DB_HOST', '127.0.0.1'),
        'port'    => (int)    $env('DB_PORT', 3306),
        'name'    => (string) $env('DB_NAME', 'mips_platform'),
        'user'    => (string) $env('DB_USER', 'mips_user'),
        'pass'    => (string) $env('DB_PASS', 'change_me_in_production'),
        'charset' => 'utf8mb4',
    ],

    'session' => [
        'name'         => 'MIPSSESSID',
        'lifetime'     => 0,        // 0 = until browser closes (cookie is session-scoped)
        'idle_timeout' => 1800,     // 30 min of inactivity = auto logout
        'path'         => '/',
        'domain'       => '',
        // MUST be true over HTTPS in production. Set SESSION_SECURE=0 only for
        // local HTTP development behind no TLS.
        'secure'       => (bool) $env('SESSION_SECURE', true),
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
