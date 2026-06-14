<?php
/**
 * Hosted payment page for a payment link: /pay.php?link=<slug>
 *
 * The payer must be authenticated (as a consumer) to complete payment — the
 * compliance gate is enforced on the merchant, not the payer.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Auth;
use App\Csrf;

$user       = Auth::require_auth();
$csrf_token = Csrf::token();
$slug       = isset($_GET['link']) ? preg_replace('/[^a-z0-9]/', '', strtolower((string) $_GET['link'])) : '';
$page_title = 'Pay';
$disclaimer = (string) ($GLOBALS['config']['platform']['legal_disclaimer'] ?? '');

require TEMPLATES_PATH . '/pay.view.php';
