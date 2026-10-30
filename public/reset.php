<?php
/**
 * Reset link: /reset.php?t=<token> → choose a new password.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

header('Referrer-Policy: no-referrer');
$token      = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';
$mode       = \App\Accounts::resetLinkValid($token) ? 'reset' : 'expired';
$csrf_token = \App\Csrf::token();
$page_title = 'Nouveau mot de passe';
if ($mode === 'expired') {
    http_response_code(404);
}

require TEMPLATES_PATH . '/account.view.php';
