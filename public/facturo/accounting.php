<?php
/**
 * Monthly accounting export for the accountant (owner/admin, also in read-only mode):
 *   /facturo/accounting.php?month=2026-10&f=journal   sales journal, CSV
 *   /facturo/accounting.php?month=2026-10&f=vat       VAT summary by tax code, CSV
 *   /facturo/accounting.php?month=2026-10&f=print     both, printable (browser "Save as PDF")
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\Facturo\Accounting;

$user = \App\Auth::require_auth();
$org  = \App\Suite\Modules::require($user, 'facturo');
if (!\App\Suite\Tenant::canManage($org)) {
    http_response_code(403);
    exit('Réservé au propriétaire et aux administrateurs.');
}
$month  = is_string($_GET['month'] ?? null) ? $_GET['month'] : '';
$period = Accounting::period($month);
$format = is_string($_GET['f'] ?? null) ? $_GET['f'] : '';
if ($period === null || !in_array($format, ['journal', 'vat', 'print'], true)) {
    http_response_code(400);
    exit('Mois ou format invalide.');
}
[$from, $to] = $period;
$journal = Accounting::journal($org['id'], $from, $to);
$vat     = Accounting::vatSummary($org['id'], $from, $to);
$profile = \App\Suite\Tenant::profile($org['id']);

if ($format === 'print') {
    $e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
    require TEMPLATES_PATH . '/modules/facturo/accounting-print.view.php';
    exit;
}

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . ($format === 'journal' ? 'journal-ventes' : 'tva') . '-' . $month . '.csv"');
header('Cache-Control: private, no-store');
$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");   // UTF-8 BOM so Excel reads accents correctly
$put = static fn (array $row) => fputcsv($out, array_map([Accounting::class, 'cell'], $row), ',', '"', '');

if ($format === 'journal') {
    $put(['date', 'type', 'numero', 'facture_d_origine', 'client', 'brn_client', 'tva_client', 'tan_client', 'devise',
          'montant_ht', 'tva', 'montant_ttc', 'statut', 'echeance', 'payee_le', 'mra_statut', 'mra_irn']);
    foreach ($journal as $r) {
        $put([$r['date'], Accounting::TYPE_LABELS[$r['type']], $r['number'], $r['source_number'], $r['client'], $r['client_brn'],
              $r['client_vat'], $r['client_tan'], $r['currency'], Accounting::amount($r['net_cents']), Accounting::amount($r['vat_cents']),
              Accounting::amount($r['total_cents']), $r['status'], $r['due_date'], $r['paid_at'], $r['mra_status'], $r['mra_irn']]);
    }
} else {
    $put(['code_tva_mra', 'traitement', 'taux_pct', 'base_ht_mur', 'tva_mur']);
    foreach ($vat['rows'] as $r) {
        $put([$r['code'], $r['label'], $r['rate'], Accounting::amount($r['net_cents']), Accounting::amount($r['vat_cents'])]);
    }
    $put(['', 'Total', '', Accounting::amount($vat['net_cents']), Accounting::amount($vat['vat_cents'])]);
    foreach ($vat['other_currencies'] as $cur => $n) {
        $put(['', 'Non inclus : ' . $n . ' document(s) en ' . $cur . ' (voir le journal)', '', '', '']);
    }
}
fclose($out);
