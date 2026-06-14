<?php
/**
 * PassPass portal — a single role-aware page that exercises the platform's
 * onboarding, compliance, payment and settlement flows. Sections render based on
 * the caller's RBAC permissions (the same checks the API enforces server-side).
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Auth;
use App\Csrf;
use App\Domain\Role;
use App\Rbac;

$user       = Auth::require_auth();
$csrf_token = Csrf::token();
$page_title = 'Portal';
$role       = Role::fromRaw((string) ($user['role'] ?? 'consumer'));

$sections = [
    'merchant'       => Rbac::can($user, 'merchant.self.update'),
    'links'          => Rbac::can($user, 'paymentlink.manage'),
    'qr'             => Rbac::can($user, 'qr.manage'),
    'pay'            => Rbac::can($user, 'payment.initiate'),
    'credentials'    => Rbac::can($user, 'credential.self.manage'),
    'compliance'     => Rbac::can($user, 'kyc.decide'),
    'finance'        => Rbac::can($user, 'settlement.batch.manage'),
    'reconciliation' => Rbac::can($user, 'reconciliation.manage'),
    'kpis'           => Rbac::can($user, 'report.read.all'),
    'routing'        => Rbac::can($user, 'platform.routing.manage'),
];

$disclaimer = (string) ($GLOBALS['config']['platform']['legal_disclaimer'] ?? '');

require TEMPLATES_PATH . '/portal.view.php';
