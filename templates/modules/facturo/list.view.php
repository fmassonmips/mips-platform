<?php
/**
 * @var callable $e
 * @var string $type
 * @var list<array<string,mixed>> $documents
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$titles = ['quote' => 'Devis', 'invoice' => 'Factures', 'credit_note' => 'Avoirs'];
$newLabels = ['quote' => 'Nouveau devis', 'invoice' => 'Nouvelle facture'];
$emptyLabels = ['quote' => 'Aucun devis pour l\'instant.', 'invoice' => 'Aucune facture pour l\'instant.', 'credit_note' => 'Aucun avoir pour l\'instant.'];
?>
<section class="card">
  <div class="card-head">
    <h2><?= $e($titles[$type]) ?></h2>
    <?php if ($type === 'credit_note'): ?>
      <span class="muted small">Ouvrez une facture émise et choisissez « Créer un avoir ».</span>
    <?php else: ?>
      <a class="btn-secondary" href="/app.php?m=facturo&amp;p=edit&amp;type=<?= $e($type) ?>"><?= $e($newLabels[$type]) ?></a>
    <?php endif; ?>
  </div>

  <?php if ($documents === []): ?>
    <p class="muted"><?= $e($emptyLabels[$type]) ?></p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Numéro</th><th>Client</th><th>Date</th><th>Statut</th><th class="num">Total TTC</th></tr>
        </thead>
        <tbody>
          <?php foreach ($documents as $d): ?>
            <tr>
              <td><a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $d['id'] ?>"><?= $e($d['number'] ?? 'Brouillon') ?></a></td>
              <td><?= $e($d['client_name']) ?></td>
              <td><?= $e($d['issue_date']) ?></td>
              <td><span class="status status--<?= $e($d['status']) ?>"><?= $e(Documents::statusLabel($type, (string) $d['status'])) ?></span></td>
              <td class="num"><?= $e(Money::format((int) $d['total_cents'], (string) $d['currency'])) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
