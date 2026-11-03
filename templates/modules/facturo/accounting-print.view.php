<?php
/**
 * Printable monthly summary for the accountant (browser "Save as PDF").
 *
 * @var callable $e
 * @var string $month
 * @var list<array<string,mixed>> $journal
 * @var array<string,mixed> $vat
 * @var array<string,string> $profile
 */
use App\Facturo\Accounting;
use App\Facturo\Money;
use App\Format;

$monthName = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][(int) substr($month, 5, 2) - 1] . ' ' . substr($month, 0, 4);
$seller = ($profile['legal_name'] ?? '') !== '' ? $profile['legal_name'] : ($profile['name'] ?? '');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ventes et TVA — <?= $e($monthName) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="print-body">
  <div class="print-toolbar">
    <button type="button" id="print-btn" class="btn-secondary">Imprimer / PDF</button>
  </div>
  <article class="doc accounting-print">
    <h1>Ventes et TVA — <?= $e($monthName) ?></h1>
    <p class="muted"><?= $e($seller) ?><?= ($profile['brn'] ?? '') !== '' ? ' · BRN ' . $e($profile['brn']) : '' ?><?= ($profile['vat_number'] ?? '') !== '' ? ' · N° TVA ' . $e($profile['vat_number']) : '' ?>
      · édité le <?= $e(Format::date(date('Y-m-d'))) ?></p>

    <h2>Récapitulatif TVA (MUR)</h2>
    <?php if ($vat['documents'] === 0): ?>
      <p class="muted">Aucune facture ni aucun avoir en roupies émis ce mois-ci.</p>
    <?php else: ?>
      <table class="table">
        <thead><tr><th>Traitement</th><th>Code MRA</th><th class="num">Base HT</th><th class="num">TVA</th></tr></thead>
        <tbody>
          <?php foreach ($vat['rows'] as $r): ?>
            <tr><td><?= $e($r['label']) ?></td><td><?= $e($r['code']) ?></td>
              <td class="num"><?= $e(Money::format($r['net_cents'], 'MUR')) ?></td><td class="num"><?= $e(Money::format($r['vat_cents'], 'MUR')) ?></td></tr>
          <?php endforeach; ?>
        </tbody>
        <tfoot>
          <tr><th colspan="2">Total (<?= (int) $vat['documents'] ?> document<?= $vat['documents'] > 1 ? 's' : '' ?>, avoirs déduits)</th>
            <th class="num"><?= $e(Money::format($vat['net_cents'], 'MUR')) ?></th><th class="num"><?= $e(Money::format($vat['vat_cents'], 'MUR')) ?></th></tr>
          <tr><th colspan="3">Total TTC facturé</th><th class="num"><?= $e(Money::format($vat['total_cents'], 'MUR')) ?></th></tr>
        </tfoot>
      </table>
    <?php endif; ?>
    <?php foreach ($vat['other_currencies'] as $cur => $n): ?>
      <p class="small">Non inclus dans ce récapitulatif : <?= (int) $n ?> document(s) en <?= $e($cur) ?>, listés ci-dessous (aucun taux de change n'est enregistré).</p>
    <?php endforeach; ?>

    <h2>Journal des ventes</h2>
    <?php if ($journal === []): ?>
      <p class="muted">Aucun document émis ce mois-ci.</p>
    <?php else: ?>
      <table class="table">
        <thead><tr><th>Date</th><th>Numéro</th><th>Client</th><th class="num">HT</th><th class="num">TVA</th><th class="num">TTC</th><th>Statut</th><th>MRA</th></tr></thead>
        <tbody>
          <?php foreach ($journal as $r): ?>
            <tr>
              <td><?= $e(Format::date($r['date'])) ?></td>
              <td><?= $e($r['number']) ?><?= $r['source_number'] !== '' ? '<br><span class="small muted">sur ' . $e($r['source_number']) . '</span>' : '' ?></td>
              <td><?= $e($r['client']) ?></td>
              <td class="num"><?= $e(Money::format($r['net_cents'], $r['currency'])) ?></td>
              <td class="num"><?= $e(Money::format($r['vat_cents'], $r['currency'])) ?></td>
              <td class="num"><?= $e(Money::format($r['total_cents'], $r['currency'])) ?></td>
              <td><?= $e($r['status']) ?></td>
              <td><?= $e(['fiscalised' => 'Fiscalisé', 'pending' => 'En attente', 'rejected' => 'Rejeté', 'unknown' => 'Sans réponse'][$r['mra_status']] ?? '—') ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
    <p class="small muted">Montants lus sur les documents émis, sans recalcul. Les avoirs sont comptés en négatif. Un document appartient au mois de sa date d'émission.</p>
  </article>
  <script src="/assets/js/facturo-print.js"></script>
</body>
</html>
