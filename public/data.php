<?php
/**
 * « Vos données » (owner): download everything, close the company's account
 * (deleted after Closure::DELAY_DAYS days, cancellable until then).
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Suite\Closure;
use App\Suite\Tenant;

$user = \App\Auth::require_auth();
$org  = Tenant::forUser($user);
if ($org['role'] !== 'owner') {
    header('Location: /dashboard.php');
    exit;
}
$closing    = Closure::scheduledAt($org['id']);
$csrf_token = \App\Csrf::token();
$page_title = 'Vos données';

require TEMPLATES_PATH . '/data.view.php';
