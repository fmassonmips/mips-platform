<?php
/**
 * Policies / contracts list page. Protected.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user          = \App\Auth::require_auth();
$csrf_token    = \App\Csrf::token();
$active        = 'contracts';
$page_title    = \App\I18n::t('contracts.title');
$clientOptions = \App\Models\Client::options();

require TEMPLATES_PATH . '/contracts.view.php';
