<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

if (\App\Portal\PortalAuth::current() !== null) {
    header('Location: /portal/home.php');
    exit;
}

$csrf_token = \App\Csrf::token();
$page_title = 'Forgot your password';

require TEMPLATES_PATH . '/portal/forgot.view.php';
