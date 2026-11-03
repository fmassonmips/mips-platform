<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

$user = \App\Portal\PortalAuth::requireUser();
if (empty($user['totp_enabled_at'])) {
    header('Location: /portal/security.php?enroll=1');
    exit;
}
$csrf_token = \App\Csrf::token();
$page_title = 'Terms of use';
$active     = 'terms';

require TEMPLATES_PATH . '/portal/terms.view.php';
