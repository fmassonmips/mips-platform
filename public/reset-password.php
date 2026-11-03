<?php
/**
 * Public page reached from a reset link: /reset-password.php?token=...
 * The token is checked here only to show a friendly message; it is
 * re-validated and consumed by POST /api/auth/reset.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

// Keep the token out of Referer headers sent to any other origin.
header('Referrer-Policy: no-referrer');

$token       = is_string($_GET['token'] ?? null) ? (string) $_GET['token'] : '';
$token_valid = \App\PasswordReset::find($token) !== null;
$csrf_token  = \App\Csrf::token();
$page_title  = 'Choose a new password';

require TEMPLATES_PATH . '/reset-password.view.php';
