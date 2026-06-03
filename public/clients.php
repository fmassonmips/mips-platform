<?php
/**
 * Clients (CRM) list page. Protected.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_auth();
$csrf_token = \App\Csrf::token();
$active     = 'clients';
$page_title = \App\I18n::t('clients.title');

require TEMPLATES_PATH . '/clients.view.php';
