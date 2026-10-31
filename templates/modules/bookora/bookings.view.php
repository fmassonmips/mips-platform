<?php
/**
 * @var callable $e
 * @var string $filter
 * @var list<array<string,mixed>> $bookings
 * @var array<string,int> $counts
 */
use App\Bookora\Bookings;
use App\Facturo\Money;
use App\Format;

$filters = ['todo' => 'À confirmer', 'upcoming' => 'À venir', 'past' => 'Passées', 'closed' => 'Annulées / expirées', 'all' => 'Toutes'];
?>
<section class="card">
  <nav class="filter-tabs" aria-label="Filtres">
    <?php foreach ($filters as $k => $label): ?>
      <a href="/app.php?m=bookora&amp;p=bookings&amp;f=<?= $e($k) ?>"<?= $filter === $k ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?> <span class="count"><?= (int) $counts[$k] ?></span></a>
    <?php endforeach; ?>
  </nav>
  <?php if ($bookings === []): ?>
    <p class="muted">Aucune réservation.</p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>N°</th><th>Logement</th><th>Client</th><th>Arrivée</th><th>Départ</th><th class="num">Nuits</th><th class="num">Total</th><th>Paiement</th><th>Statut</th></tr></thead>
      <tbody>
        <?php foreach ($bookings as $b): ?>
          <tr>
            <td><a href="/app.php?m=bookora&amp;p=booking&amp;id=<?= (int) $b['id'] ?>">#<?= (int) $b['number'] ?></a></td>
            <td><?= $e($b['unit_name']) ?></td>
            <td><?= $e($b['guest_name']) ?> <span class="muted small">· <?= (int) $b['guests'] ?> pers.</span></td>
            <td class="nowrap"><?= $e(Format::date((string) $b['check_in'])) ?></td>
            <td class="nowrap"><?= $e(Format::date((string) $b['check_out'])) ?></td>
            <td class="num"><?= (int) $b['nights'] ?></td>
            <td class="num"><?= $e(Money::format((int) $b['total_cents'], 'MUR')) ?></td>
            <td class="small"><?= $b['paid_at'] !== null ? '<span class="pos">payée</span>' : ($b['deposit_paid_at'] !== null ? 'acompte reçu' : '<span class="muted">rien reçu</span>') ?></td>
            <td><span class="status status--bk-<?= $e($b['state']) ?>"><?= $e(Bookings::STATUSES[$b['state']]) ?></span></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
