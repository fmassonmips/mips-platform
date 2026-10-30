<?php
/**
 * "Forgot password" page: asks for the e-mail, a reset link is sent if it has an account.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

if (\App\Auth::current_user() !== null) {
    header('Location: /dashboard.php');
    exit;
}
$token      = '';
$mode       = 'forgot';
$csrf_token = \App\Csrf::token();
$page_title = 'Mot de passe oublié';

require TEMPLATES_PATH . '/account.view.php';
