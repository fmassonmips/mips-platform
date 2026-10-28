<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

$user = \App\Portal\PortalAuth::requireUser();
$csrf_token = \App\Csrf::token();
$page_title = 'Security';
$active     = 'security';

require TEMPLATES_PATH . '/portal/security.view.php';
