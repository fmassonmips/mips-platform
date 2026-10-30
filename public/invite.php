<?php
/**
 * Invitation link: /invite.php?t=<token>. Shows the company and lets the
 * invitee choose a name and password (accepted by /api/auth/invite).
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

header('Referrer-Policy: no-referrer');
$token      = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';
$invitation = \App\Suite\Team::findByToken($token);
$current    = \App\Auth::current_user();
$csrf_token = \App\Csrf::token();
$page_title = 'Invitation';
if ($invitation === null) {
    http_response_code(404);
}

require TEMPLATES_PATH . '/invite.view.php';
