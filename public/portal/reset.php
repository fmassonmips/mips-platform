<?php
/** Password reset link: /portal/reset.php?token=... */
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

header('Referrer-Policy: no-referrer');
$token       = is_string($_GET['token'] ?? null) ? (string) $_GET['token'] : '';
$token_valid = \App\Portal\PortalTokens::peek($token, 'reset') !== null;
$csrf_token  = \App\Csrf::token();
$page_title  = 'Choose a new password';

require TEMPLATES_PATH . '/portal/reset.view.php';
