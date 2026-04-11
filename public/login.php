<?php
/**
 * Public login page.
 * Renders the login form with a fresh CSRF token. If the visitor is already
 * authenticated, redirects straight to the dashboard.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

if (\App\Auth::current_user() !== null) {
    header('Location: /dashboard.php');
    exit;
}

$csrf_token = \App\Csrf::token();
$page_title = 'Sign in';

require TEMPLATES_PATH . '/login.view.php';
