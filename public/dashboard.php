<?php
/**
 * Protected dashboard page.
 * Any non-authenticated visitor is redirected to /login.php by require_auth().
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_auth();
$csrf_token = \App\Csrf::token();
$page_title = 'Dashboard';

require TEMPLATES_PATH . '/dashboard.view.php';
