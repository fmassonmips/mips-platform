<?php
/**
 * Application bootstrap.
 * - Loads config
 * - Registers a PSR-4-style autoloader for the App\ namespace under /src
 * - Sets strict error handling and security headers
 * - Starts the secure session
 *
 * Every public entry point (pages and API handlers) must require this file
 * before doing anything else.
 */
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

define('ROOT_PATH',      dirname(__DIR__));
define('SRC_PATH',       ROOT_PATH . '/src');
define('CONFIG_PATH',    ROOT_PATH . '/config');
define('TEMPLATES_PATH', ROOT_PATH . '/templates');

/** @var array<string,mixed> $config */
$config = require CONFIG_PATH . '/config.php';

// Optional, environment-specific overrides (DB credentials, API keys, ...).
// This file holds real secrets, is NOT committed to git, and is deployed
// only to the target server. See config/config.local.example.php.
$localConfig = CONFIG_PATH . '/config.local.php';
if (is_file($localConfig)) {
    /** @var mixed $overrides */
    $overrides = require $localConfig;
    if (is_array($overrides)) {
        $config = array_replace_recursive($config, $overrides);
    }
}

$GLOBALS['config'] = $config;

if (($config['app']['env'] ?? 'production') === 'development') {
    ini_set('display_errors', '1');
}

/**
 * Simple PSR-4 autoloader for the App\ namespace rooted at /src.
 */
spl_autoload_register(static function (string $class): void {
    $prefix  = 'App\\';
    $baseDir = SRC_PATH . '/';
    $len     = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    $relative = substr($class, $len);
    $file     = $baseDir . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// --- Security headers applied to every response ---------------------------
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
header(
    "Content-Security-Policy: default-src 'self'; "
    . "img-src 'self' data:; style-src 'self'; script-src 'self'; "
    . "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
);

// HSTS only makes sense over HTTPS.
$isHttps = (($_SERVER['HTTPS'] ?? '') === 'on')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

// Start the secure session.
App\Session::start($config['session']);
