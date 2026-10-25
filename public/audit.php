<?php
/**
 * Audit log page. Requires the 'audit' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('audit');
$csrf_token = \App\Csrf::token();
$page_title = 'Audit log';

require TEMPLATES_PATH . '/audit.view.php';
