<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

if (\App\Portal\PortalAuth::current() !== null) {
    header('Location: /portal/home.php');
    exit;
}

$csrf_token = \App\Csrf::token();
$page_title = 'Create an account';

require TEMPLATES_PATH . '/portal/register.view.php';
