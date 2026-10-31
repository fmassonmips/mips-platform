<?php
/**
 * Printable quote/invoice: /facturo/print.php?id=<id>
 * Standalone page (no app chrome); the browser's "Save as PDF" produces the PDF.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$user = \App\Auth::require_auth();
$org  = \App\Suite\Modules::require($user, 'facturo');
$id   = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
$doc  = $id > 0 ? \App\Facturo\Documents::find($org['id'], $id) : null;

// Drafts have no number and no frozen details: they are not printable.
if ($doc === null || $doc['status'] === 'draft') {
    header('Location: /app.php?m=facturo');
    exit;
}

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
require TEMPLATES_PATH . '/modules/facturo/print.view.php';
