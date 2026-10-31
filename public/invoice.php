<?php
/**
 * Printable invoice: /invoice.php?id=123
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

\App\Auth::require_access('billing');

$invoice = (new \App\Billing\InvoiceService())->find((int) ($_GET['id'] ?? 0));
if ($invoice === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Invoice not found';
    exit;
}

$issuer     = $GLOBALS['config']['billing']['issuer'] ?? [];
$page_title = 'Invoice ' . ($invoice['number'] ?? 'draft');

require TEMPLATES_PATH . '/invoice.view.php';
