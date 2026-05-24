<?php
/**
 * Application bootstrap — InsurLink MU
 *
 * Loads config, registers autoloaders, sets security headers,
 * and starts the secure session.
 *
 * Every entry point (index.php, install.php, cron scripts) must
 * require this file before doing anything else.
 */
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// ROOT_PATH may already be defined by index.php (which is the web root).
// When bootstrap.php is included from a cron or CLI script one level
// deeper, it defines ROOT_PATH itself so that dirname(__DIR__) still
// resolves correctly from src/.
defined('ROOT_PATH') || define('ROOT_PATH', dirname(__DIR__));

define('APP_PATH',       ROOT_PATH . '/app');
define('SRC_PATH',       ROOT_PATH . '/src');
define('CONFIG_PATH',    ROOT_PATH . '/config');
define('TEMPLATES_PATH', ROOT_PATH . '/templates');

/** @var array<string,mixed> $config */
$config = require CONFIG_PATH . '/config.php';
$GLOBALS['config'] = $config;

if (($config['app']['env'] ?? 'production') === 'development') {
    ini_set('display_errors', '1');
}

// ── PSR-4-style autoloader ────────────────────────────────────────────────────
//
// Namespace mapping:
//   App\Controllers\*   → app/Controllers/*.php   (business-layer controllers)
//   App\Models\*        → app/Models/*.php         (models placed in app/)
//   App\Services\*      → src/Services/*.php       (service classes in src/)
//   App\*               → src/*.php                (Session, Database, Csrf, etc.)
//
// Resolution order: app/ is checked first so that app/Controllers/ takes
// precedence over any identically-named class that might exist under src/.
//
spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    $len    = strlen($prefix);

    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative = substr($class, $len);          // e.g. "Controllers\ClientController"
    $relPath  = str_replace('\\', '/', $relative) . '.php';

    // 1. Try app/ first (App\Controllers\*, App\Models\* etc. placed there)
    $appFile = APP_PATH . '/' . $relPath;
    if (is_file($appFile)) {
        require $appFile;
        return;
    }

    // 2. Fall back to src/ (App\Session, App\Database, App\Services\*, etc.)
    $srcFile = SRC_PATH . '/' . $relPath;
    if (is_file($srcFile)) {
        require $srcFile;
    }
});

// ── Security headers ──────────────────────────────────────────────────────────
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');

// CSP: allow Tailwind CDN and Alpine.js (jsdelivr) with unsafe-inline for
// their inline style/script injection; keep everything else self-only.
header(
    "Content-Security-Policy: "
    . "default-src 'self'; "
    . "img-src 'self' data:; "
    . "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; "
    . "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; "
    . "connect-src 'self'; "
    . "frame-ancestors 'none'; "
    . "base-uri 'self'; "
    . "form-action 'self'"
);

// HSTS — only meaningful over HTTPS.
$isHttps = (($_SERVER['HTTPS'] ?? '') === 'on')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

// ── Session ───────────────────────────────────────────────────────────────────
App\Session::start($config['session']);
