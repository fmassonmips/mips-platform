<?php
/**
 * Reports page. Requires the 'reporting' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('reporting');
$csrf_token = \App\Csrf::token();
$page_title = 'Reports';

require TEMPLATES_PATH . '/reports.view.php';
