<?php
/**
 * Dashboard / overview page. Protected.
 * Any non-authenticated visitor is redirected to /login.php by require_auth().
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_auth();
$csrf_token = \App\Csrf::token();
$active     = 'dashboard';
$page_title = \App\I18n::t('dashboard.title');

require TEMPLATES_PATH . '/dashboard.view.php';
