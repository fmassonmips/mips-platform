<?php
/**
 * Billing page. Requires the 'billing' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('billing');
$csrf_token = \App\Csrf::token();
$page_title = 'Billing';

require TEMPLATES_PATH . '/billing.view.php';
