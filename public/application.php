<?php
/** Staff: one merchant portal application (pre-qualification). */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('onboarding');
$csrf_token = \App\Csrf::token();
$page_title = 'Portal application';

require TEMPLATES_PATH . '/application.view.php';
