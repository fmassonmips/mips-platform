<?php
/**
 * The signed-in user's security settings: password and two-factor authentication.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_auth();
$csrf_token = \App\Csrf::token();
$page_title = 'Account';

require TEMPLATES_PATH . '/account.view.php';
