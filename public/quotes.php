<?php
/**
 * Quote requests (devis) list page. Protected.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user          = \App\Auth::require_auth();
$csrf_token    = \App\Csrf::token();
$active        = 'quotes';
$page_title    = \App\I18n::t('quotes.title');
$clientOptions = \App\Models\Client::options();

require TEMPLATES_PATH . '/quotes.view.php';
