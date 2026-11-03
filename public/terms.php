<?php
/** Staff (admin): terms of use of the merchant portal. */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('terms');
$csrf_token = \App\Csrf::token();
$page_title = 'Portal terms of use';

require TEMPLATES_PATH . '/terms.view.php';
