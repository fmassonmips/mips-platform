<?php
/**
 * Environment-specific overrides.
 *
 * Copy this file to `config/config.local.php` on the target server and fill in
 * real values. It is merged over config/config.php at bootstrap via
 * array_replace_recursive(), so you only need to list the keys you override.
 *
 * `config/config.local.php` is git-ignored — keep all real secrets here, never
 * in config/config.php.
 */
declare(strict_types=1);

return [
    'app' => [
        'env' => 'production',
    ],

    'db' => [
        // ICDSoft exposes MySQL on a non-standard local port; use 127.0.0.1
        // (not "localhost") so PDO connects over TCP to that port rather than a
        // unix socket.
        'host' => '127.0.0.1',
        'port' => 3308,
        'name' => 'maucrm_inflow',
        'user' => 'inflow',
        'pass' => 'CHANGE_ME',
    ],

    'inflow' => [
        // Live Inflow secret key (inflow_prod_...). Leave blank to disable the
        // payment endpoints (they will return 503 until this is set).
        'api_key'              => '',
        'three_ds_success_url' => 'https://inflow.maucrm.com/payment-success.html',
        'three_ds_failure_url' => 'https://inflow.maucrm.com/payment-failed.html',
    ],
];
