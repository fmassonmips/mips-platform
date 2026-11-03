<?php
/**
 * Reconciliation page (recon-run). Requires the 'recon' module role (see config 'access').
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user       = \App\Auth::require_access('recon');
$csrf_token = \App\Csrf::token();
$page_title = 'Reconciliation';

require TEMPLATES_PATH . '/recon-run.view.php';
