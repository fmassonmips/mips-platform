<?php
/**
 * Merchant page. Requires the 'merchants' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('merchants');
$csrf_token = \App\Csrf::token();
$page_title = 'Merchant';

require TEMPLATES_PATH . '/merchant.view.php';
