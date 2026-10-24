<?php
/**
 * Protected dashboard page: the suite app launcher.
 * Any non-authenticated visitor is redirected to /login.php by require_auth().
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_auth();
$org        = \App\Suite\Tenant::forUser($user);
$catalog    = \App\Suite\Catalog::all();
$enabled    = \App\Suite\Modules::enabledFor($org['id']);
$trial_ended = \App\Suite\Modules::trialEndedFor($org['id']);
$can_manage = \App\Suite\Tenant::canManage($org);
$csrf_token = \App\Csrf::token();
$page_title = 'Dashboard';

require TEMPLATES_PATH . '/dashboard.view.php';
