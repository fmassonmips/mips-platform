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
$read_only   = \App\Suite\Modules::readOnlyFor($org['id']);
$subscribe   = trim((string) ($GLOBALS['config']['billing']['contact_email'] ?? ''));
$can_manage = \App\Suite\Tenant::canManage($org);
$team_size  = count(\App\Suite\Tenant::members($org['id']));
$is_staff   = \App\Backoffice\Staff::is($user);
$csrf_token = \App\Csrf::token();
$page_title = 'Tableau de bord';

require TEMPLATES_PATH . '/dashboard.view.php';
