<?php
/**
 * User administration page. Requires the 'users' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('users');
$csrf_token = \App\Csrf::token();
$page_title = 'Users';

require TEMPLATES_PATH . '/users.view.php';
