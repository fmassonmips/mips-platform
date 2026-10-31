<?php
/**
 * @var callable $e
 * @var array<string,mixed> $booking
 * @var array<string,mixed> $settings
 * @var bool $facturo
 * @var bool $can_manage
 */
use App\Bookora\Bookings;
use App\Bookora\Notifier;
use App\Facturo\Money;
use App\Format;

$b     = $booking;
$id    = (int) $b['id'];
$state = $b['state'];
?>
<section class="card">
  <div class="card-head">
    <div>
      <p class="small muted"><a href="/app.php?m=bookora&amp;p=bookings">← Réservations</a> · <?= $b['source'] === 'manual' ? 'saisie par l\'équipe' : 'demande en ligne' ?> le <?= $e(Format::dateTime((string) $b['created_at'])) ?></p>
      <h2>Réservation #<?= (int) $b['number'] ?> <span class="status status--bk-<?= $e($state) ?>"><?= $e(Bookings::STATUSES[$state]) ?></span></h2>
    </div>
    <div class="actions">
      <?php if (in_array($state, ['new', 'expired'], true)): ?><button type="button" class="btn-primary btn-inline" data-bk="confirm" data-id="<?= $id ?>">Confirmer</button><?php endif; ?>
      <?php if (in_array($b['status'], ['new', 'confirmed'], true)): ?><button type="button" class="btn-link danger" data-bk="cancel" data-id="<?= $id ?>">Annuler</button><?php endif; ?>
    </div>
  </div>
  <?php if ($state === 'new'): ?><p class="small">Dates bloquées jusqu'au <?= $e(Format::dateTime((string) $b['hold_until'])) ?>. Confirmez à réception de l'acompte ; sans réponse, la demande expire et les dates se libèrent.</p><?php endif; ?>
  <?php if ($state === 'expired'): ?><p class="small">Le délai est passé et les dates sont libres à nouveau ; vous pouvez encore confirmer si elles n'ont pas été prises.</p><?php endif; ?>
  <div class="order-grid">
    <div>
      <p><strong><?= $e($b['unit_name']) ?></strong> · <?= (int) $b['guests'] ?> personne(s)<br>
        Arrivée le <?= $e(Format::date((string) $b['check_in'])) ?> (<?= $e($settings['checkin_time']) ?>) · départ le <?= $e(Format::date((string) $b['check_out'])) ?> (<?= $e($settings['checkout_time']) ?>) · <?= (int) $b['nights'] ?> nuit(s)</p>
      <table class="table">
        <tbody>
          <?php foreach ($b['lines'] as $l): ?>
            <tr><td><?= $e($l['description']) ?></td><td class="num"><?= $e(Money::format((int) $l['line_total_cents'] + (int) $l['line_tax_cents'], 'MUR')) ?></td></tr>
          <?php endforeach; ?>
        </tbody>
      </table>
      <dl class="totals">
        <dt>Total HT</dt><dd><?= $e(Money::format((int) $b['subtotal_cents'], 'MUR')) ?></dd>
        <dt>TVA</dt><dd><?= $e(Money::format((int) $b['tax_cents'], 'MUR')) ?></dd>
        <dt>Total TTC</dt><dd><strong><?= $e(Money::format((int) $b['total_cents'], 'MUR')) ?></strong></dd>
      </dl>
    </div>
    <div>
      <h3>Client</h3>
      <p><strong><?= $e($b['guest_name']) ?></strong><br><a href="tel:<?= $e($b['phone']) ?>"><?= $e($b['phone']) ?></a>
        <?php if ($b['email'] !== null): ?><br><a href="mailto:<?= $e($b['email']) ?>"><?= $e($b['email']) ?></a><?php endif; ?></p>
      <?php if ($b['note'] !== null): ?><p class="small">« <?= $e($b['note']) ?> »</p><?php endif; ?>
      <h3>Paiement</h3>
      <?php if ($b['status'] !== 'cancelled'): ?>
        <p>Acompte <?= $e(Money::format((int) $b['deposit_cents'], 'MUR')) ?> :
          <?= $b['deposit_paid_at'] !== null ? '<span class="pos">reçu le ' . $e(Format::date((string) $b['deposit_paid_at'])) . '</span>' : 'non reçu' ?>
          <button type="button" class="btn-link" data-bk="deposit" data-on="<?= $b['deposit_paid_at'] === null ? '1' : '0' ?>" data-id="<?= $id ?>"><?= $b['deposit_paid_at'] === null ? 'Marquer reçu' : 'Annuler' ?></button></p>
        <p>Séjour : <?= $b['paid_at'] !== null ? '<span class="pos">payé le ' . $e(Format::date((string) $b['paid_at'])) . '</span>' : 'non soldé' ?>
          <button type="button" class="btn-link" data-bk="paid" data-on="<?= $b['paid_at'] === null ? '1' : '0' ?>" data-id="<?= $id ?>"><?= $b['paid_at'] === null ? 'Marquer payé' : 'Annuler' ?></button></p>
      <?php else: ?><p class="muted">—</p><?php endif; ?>
      <?php if ($facturo && $can_manage): ?>
        <h3>Facture</h3>
        <?php if ($b['facturo_invoice_id'] !== null): ?>
          <p><a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $b['facturo_invoice_id'] ?>"><?= $e($b['invoice_number'] ?? 'Brouillon de facture') ?></a></p>
        <?php elseif ($b['status'] === 'confirmed'): ?>
          <button type="button" class="btn-secondary" data-bk="invoice" data-id="<?= $id ?>">Créer la facture (Facturo)</button>
        <?php endif; ?>
      <?php endif; ?>
      <p class="small"><a href="<?= $e(Notifier::bookingUrl((string) $b['token'])) ?>" target="_blank" rel="noopener">Page de suivi du client</a></p>
    </div>
  </div>
</section>
