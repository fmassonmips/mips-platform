<?php
/**
 * Email confirmation link: /portal/verify.php?token=...
 * The token is only consumed when the person clicks the button (a POST),
 * so mail scanners that open links do not use it up.
 */
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

header('Referrer-Policy: no-referrer');
$token      = is_string($_GET['token'] ?? null) ? (string) $_GET['token'] : '';
$csrf_token = \App\Csrf::token();
$page_title = 'Confirm your email address';

require TEMPLATES_PATH . '/portal/verify.view.php';
