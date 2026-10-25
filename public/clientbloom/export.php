<?php
/**
 * CSV export of a customer segment: /clientbloom/export.php?s=<segment>
 * Owner/admin only. The consent column tells who may receive marketing.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$user = \App\Auth::require_auth();
$org  = \App\Suite\Modules::require($user, 'clientbloom');
if (!\App\Suite\Tenant::canManage($org)) {
    http_response_code(403);
    exit('Forbidden');
}

$segment = is_string($_GET['s'] ?? null) && isset(\App\ClientBloom\Customers::SEGMENTS[$_GET['s']]) ? $_GET['s'] : 'all';
$rows    = \App\ClientBloom\Customers::search($org['id'], $segment, '', 10000);

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="customers-' . $segment . '-' . date('Y-m-d') . '.csv"');
header('Cache-Control: private, no-store');

$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");   // UTF-8 BOM so Excel reads accents correctly
fputcsv($out, ['name', 'phone', 'email', 'birthday', 'tags', 'marketing_consent', 'visits', 'total_spent_mur', 'last_visit', 'cashback_mur']);
// Prefix values that spreadsheets would evaluate as formulas.
$cell = static fn (?string $v): string => $v !== null && preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : (string) $v;
foreach ($rows as $r) {
    fputcsv($out, [
        $cell($r['name']), $cell($r['phone']), $cell($r['email']), $r['birthday'], $cell($r['tags']),
        (int) $r['marketing_consent'] === 1 ? 'yes' : 'no', (int) $r['visits'],
        \App\Facturo\Money::toInput((int) $r['total_spent_cents']), $r['last_visit_at'],
        \App\Facturo\Money::toInput((int) $r['balance_cents']),
    ]);
}
fclose($out);
