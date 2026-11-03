<?php
/**
 * Accounting tab: pick a month, see its VAT summary, download the files for the accountant.
 *
 * @var callable $e
 * @var string $month
 * @var list<string> $months
 * @var array<string,mixed> $vat
 * @var int $documents
 */
use App\Facturo\Money;

$names = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
$name  = static fn (string $m): string => $names[(int) substr($m, 5, 2) - 1] . ' ' . substr($m, 0, 4);
$q     = static fn (string $f): string => '/facturo/accounting.php?month=' . rawurlencode($month) . '&amp;f=' . $f;
?>
<section class="card">
  <div class="card-head">
    <h2>Comptabilité</h2>
    <form method="get" action="/app.php" class="inline-form">
      <input type="hidden" name="m" value="facturo"><input type="hidden" name="p" value="accounting">
      <label for="acc-month">Mois</label>
      <select id="acc-month" name="month">
        <?php foreach ($months as $m): ?>
          <option value="<?= $e($m) ?>"<?= $m === $month ? ' selected' : '' ?>><?= $e($name($m)) ?></option>
        <?php endforeach; ?>
      </select>
      <button type="submit" class="btn-secondary">Afficher</button>
    </form>
  </div>
  <p class="muted">Les fichiers à remettre à votre comptable pour <?= $e($name($month)) ?> : toutes les factures et tous les avoirs émis ce mois-ci, et le récapitulatif de TVA par code MRA. Les avoirs sont déduits.</p>

  <?php if ($documents === 0): ?>
    <p class="muted">Aucune facture ni aucun avoir émis en <?= $e($name($month)) ?>.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table" id="acc-vat">
        <thead><tr><th>Traitement</th><th>Code MRA</th><th class="num">Base HT</th><th class="num">TVA</th></tr></thead>
        <tbody>
          <?php foreach ($vat['rows'] as $r): ?>
            <tr><td><?= $e($r['label']) ?></td><td><?= $e($r['code']) ?></td>
              <td class="num"><?= $e(Money::format($r['net_cents'], 'MUR')) ?></td><td class="num"><?= $e(Money::format($r['vat_cents'], 'MUR')) ?></td></tr>
          <?php endforeach; ?>
        </tbody>
        <tfoot>
          <tr><th colspan="2">Total en roupies</th><th class="num"><?= $e(Money::format($vat['net_cents'], 'MUR')) ?></th><th class="num"><?= $e(Money::format($vat['vat_cents'], 'MUR')) ?></th></tr>
        </tfoot>
      </table>
    </div>
    <?php foreach ($vat['other_currencies'] as $cur => $n): ?>
      <p class="small">+ <?= (int) $n ?> document(s) en <?= $e($cur) ?>, dans le journal mais pas dans ce récapitulatif (aucun taux de change n'est enregistré).</p>
    <?php endforeach; ?>
    <p class="actions">
      <a class="btn-secondary" id="acc-journal" href="<?= $q('journal') ?>">Journal des ventes (CSV)</a>
      <a class="btn-secondary" id="acc-vat-csv" href="<?= $q('vat') ?>">Récapitulatif TVA (CSV)</a>
      <a class="btn-secondary" id="acc-print" href="<?= $q('print') ?>" target="_blank" rel="noopener">Version imprimable / PDF</a>
    </p>
  <?php endif; ?>
  <p class="small muted">Ce récapitulatif aide votre comptable ; il ne remplace pas la déclaration de TVA, qu'il ou vous restez responsables d'établir.</p>
</section>
