<?php
/**
 * Onboarding page. Requires the 'onboarding' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('onboarding');
$csrf_token = \App\Csrf::token();
$page_title = 'Onboarding';

require TEMPLATES_PATH . '/onboarding.view.php';
