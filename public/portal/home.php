<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

$user = \App\Portal\PortalAuth::require();
$csrf_token = \App\Csrf::token();
$page_title = 'Progress';
$active     = 'home';

require TEMPLATES_PATH . '/portal/home.view.php';
