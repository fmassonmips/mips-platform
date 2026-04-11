<?php
/**
 * Root entry point.
 * Redirects to the dashboard if the visitor is authenticated, otherwise to login.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

if (\App\Auth::current_user() !== null) {
    header('Location: /dashboard.php');
} else {
    header('Location: /login.php');
}
exit;
