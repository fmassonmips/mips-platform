<?php
/**
 * @var callable $e
 * @var array<string,mixed> $order
 * @var array<string,mixed> $settings
 * @var bool $facturo
 * @var bool $can_manage
 */
use App\Facturo\Money;
use App\Format;
use App\ShopLokal\Notifier;
use App\ShopLokal\Orders;
use App\ShopLokal\Products;

$o    = $order;
$id   = (int) $o['id'];
$next = ['new' => ['confirmed' => 'Confirmer', 'cancelled' => 'Annuler'],
         'confirmed' => ['shipped' => $o['delivery_method'] === 'pickup' ? 'Prête à retirer' : 'Expédiée', 'completed' => 'Terminée', 'cancelled' => 'Annuler'],
         'shipped' => ['completed' => 'Terminée', 'cancelled' => 'Annuler']][$o['status']] ?? [];
?>
<section class="card">
  <div class="card-head">
    <div>
      <p class="small muted"><a href="/app.php?m=shoplokal">← Commandes</a> · <?= $e(Format::dateTime((string) $o['created_at'])) ?></p>
      <h2>Commande #<?= (int) $o['number'] ?> <span class="status status--sl-<?= $e($o['status']) ?>"><?= $e(Orders::STATUSES[$o['status']]) ?></span></h2>
    </div>
    <div class="actions">
      <?php foreach ($next as $st => $label): ?>
        <button type="button" class="<?= $st === 'cancelled' ? 'btn-link danger' : 'btn-secondary' ?>" data-sl-status="<?= $e($st) ?>" data-id="<?= $id ?>"><?= $e($label) ?></button>
      <?php endforeach; ?>
    </div>
  </div>
  <div class="order-grid">
    <div>
      <table class="table">
        <thead><tr><th>Produit</th><th class="num">Qté</th><th class="num">Prix TTC</th><th class="num">Total TTC</th></tr></thead>
        <tbody>
          <?php foreach ($o['lines'] as $l): $q = (int) $l['quantity']; ?>
            <tr><td><?= $e($l['name']) ?></td><td class="num"><?= $q ?></td>
              <td class="num"><?= $e(Money::format(Products::ttc((int) $l['unit_price_cents'], (string) $l['tax_code']), 'MUR')) ?></td>
              <td class="num"><?= $e(Money::format((int) $l['line_total_cents'] + (int) $l['line_tax_cents'], 'MUR')) ?></td></tr>
          <?php endforeach; ?>
          <?php if ((int) $o['delivery_cents'] > 0): ?>
            <tr><td>Livraison</td><td></td><td></td><td class="num"><?= $e(Money::format(Products::ttc((int) $o['delivery_cents'], Orders::serviceTaxCode((int) $o['organization_id'])), 'MUR')) ?></td></tr>
          <?php endif; ?>
        </tbody>
      </table>
      <dl class="totals">
        <dt>Total HT</dt><dd><?= $e(Money::format((int) $o['subtotal_cents'], 'MUR')) ?></dd>
        <dt>TVA</dt><dd><?= $e(Money::format((int) $o['tax_cents'], 'MUR')) ?></dd>
        <dt>Total TTC</dt><dd><strong><?= $e(Money::format((int) $o['total_cents'], 'MUR')) ?></strong></dd>
      </dl>
    </div>
    <div>
      <h3>Client</h3>
      <p><strong><?= $e($o['customer_name']) ?></strong><br><a href="tel:<?= $e($o['phone']) ?>"><?= $e($o['phone']) ?></a>
        <?php if ($o['email'] !== null): ?><br><a href="mailto:<?= $e($o['email']) ?>"><?= $e($o['email']) ?></a><?php endif; ?></p>
      <p class="pre"><?= $o['delivery_method'] === 'pickup' ? 'Retrait : ' . $e($settings['pickup_address']) : 'Livraison :' . "\n" . $e($o['address']) ?></p>
      <?php if ($o['note'] !== null): ?><p class="small">« <?= $e($o['note']) ?> »</p><?php endif; ?>
      <h3>Paiement</h3>
      <p><?= $e(Orders::PAYMENTS[$o['payment_method']]) ?> ·
        <?= $o['paid_at'] !== null ? '<span class="pos">payée le ' . $e(Format::dateTime((string) $o['paid_at'])) . '</span>' : 'non payée' ?></p>
      <?php if ($o['status'] !== 'cancelled'): ?>
        <button type="button" class="btn-secondary" data-sl-paid="<?= $o['paid_at'] === null ? '1' : '0' ?>" data-id="<?= $id ?>"><?= $o['paid_at'] === null ? 'Marquer payée' : 'Annuler le paiement' ?></button>
      <?php endif; ?>
      <?php if ($facturo && $can_manage): ?>
        <h3>Facture</h3>
        <?php if ($o['facturo_invoice_id'] !== null): ?>
          <p><a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $o['facturo_invoice_id'] ?>"><?= $e($o['invoice_number'] ?? 'Brouillon de facture') ?></a></p>
        <?php elseif ($o['status'] !== 'cancelled'): ?>
          <button type="button" class="btn-secondary" id="sl-invoice" data-id="<?= $id ?>">Créer la facture (Facturo)</button>
        <?php endif; ?>
      <?php endif; ?>
      <p class="small"><a href="<?= $e(Notifier::orderUrl((string) $o['token'])) ?>" target="_blank" rel="noopener">Page de suivi du client</a></p>
    </div>
  </div>
</section>
