<?php
/**
 * Suite module entry point: /app.php?m=<slug>
 *
 * Checks the module is enabled for the user's organization, then renders
 * the shared app shell. Each module plugs its own view into the shell
 * under templates/modules/<slug>.view.php.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user   = \App\Auth::require_auth();
$slug   = is_string($_GET['m'] ?? null) ? $_GET['m'] : '';
$org    = \App\Suite\Modules::require($user, $slug);
$module = \App\Suite\Catalog::get($slug);
// Trial over: the app opens read-only (banner, inputs disabled; the API refuses every write).
$read_only = \App\Suite\Modules::readOnlyFor($org['id'])[$slug] ?? null;
$subscribe = trim((string) ($GLOBALS['config']['billing']['contact_email'] ?? ''));

$module_view = TEMPLATES_PATH . '/modules/' . $slug . '.view.php';
if (!is_file($module_view)) {
    header('Location: /dashboard.php');
    exit;
}

$csrf_token = \App\Csrf::token();
$page_title = $module['name'];

require TEMPLATES_PATH . '/app.view.php';
