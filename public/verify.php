<?php
/**
 * E-mail confirmation link: /verify.php?t=<token>. A button confirms (POST),
 * so link scanners in mailboxes cannot use the link up.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

header('Referrer-Policy: no-referrer');
$token      = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';
$mode       = 'verify';
$csrf_token = \App\Csrf::token();
$page_title = 'Confirmer votre adresse';

require TEMPLATES_PATH . '/account.view.php';
