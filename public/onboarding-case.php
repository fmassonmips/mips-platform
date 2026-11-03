<?php
/**
 * Onboarding case page. Requires the 'onboarding' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('onboarding');
$csrf_token = \App\Csrf::token();
$page_title = 'Onboarding case';

require TEMPLATES_PATH . '/onboarding-case.view.php';
