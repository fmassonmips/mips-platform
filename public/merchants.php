<?php
/**
 * Merchants page. Requires the 'merchants' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('merchants');
$csrf_token = \App\Csrf::token();
$page_title = 'Merchants';

require TEMPLATES_PATH . '/merchants.view.php';
