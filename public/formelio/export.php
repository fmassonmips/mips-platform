<?php
/**
 * CSV export of a form's responses: /formelio/export.php?id=<form id>
 * Owner/admin only. One column per current question; answers to deleted
 * questions are left out (they stay visible in the app).
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$user = \App\Auth::require_auth();
$org  = \App\Suite\Modules::require($user, 'formelio');
if (!\App\Suite\Tenant::canManage($org)) {
    http_response_code(403);
    exit('Accès refusé');
}
$id   = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
$form = \App\Formelio\Forms::find($org['id'], $id);
if ($form === null) {
    http_response_code(404);
    exit('Formulaire introuvable');
}
$responses = \App\Formelio\Responses::forForm($org['id'], $id);

$slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', (string) $form['title']) ?: 'formulaire')) ?? '', '-');
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="reponses-' . ($slug !== '' ? $slug : 'formulaire') . '-' . date('Y-m-d') . '.csv"');
header('Cache-Control: private, no-store');

$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");   // UTF-8 BOM so Excel reads accents correctly
// Prefix values that spreadsheets would evaluate as formulas.
$cell = static fn (string $v): string => preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
fputcsv($out, array_merge(['date', 'source'], array_map(static fn (array $f): string => $cell((string) $f['label']), $form['fields'])));
foreach (array_reverse($responses) as $r) {
    $byId = array_column($r['answers'], 'value', 'id');
    $row  = [$r['created_at'], (string) ($r['source'] ?? '')];
    foreach ($form['fields'] as $f) {
        $row[] = $cell(\App\Formelio\Responses::display($byId[$f['id']] ?? null));
    }
    fputcsv($out, $row);
}
fclose($out);
