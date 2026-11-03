<?php
/**
 * Printable client statement: /facturo/statement.php?client=<id>
 * Standalone page in the client's document language; the browser's "Save as PDF" produces the PDF.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$user   = \App\Auth::require_auth();
$org    = \App\Suite\Modules::require($user, 'facturo');
$id     = ctype_digit((string) ($_GET['client'] ?? '')) ? (int) $_GET['client'] : 0;
$client = $id > 0 ? \App\Facturo\Clients::find($org['id'], $id) : null;
if ($client === null) {
    header('Location: /app.php?m=facturo&p=clients');
    exit;
}
$profile   = \App\Suite\Tenant::profile($org['id']);
$lang      = \App\Facturo\DocText::normalize($client['document_language'] ?? $profile['document_language']);
$today     = date('Y-m-d');
$statement = \App\Facturo\Statement::build($org['id'], $id, $today);
$t         = \App\Facturo\Statement::TEXT[$lang];
$e         = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
require TEMPLATES_PATH . '/modules/facturo/statement.view.php';
