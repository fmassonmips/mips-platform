<?php
/**
 * Public "forgot password" page.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$csrf_token = \App\Csrf::token();
$page_title = 'Forgot password';

require TEMPLATES_PATH . '/forgot-password.view.php';
