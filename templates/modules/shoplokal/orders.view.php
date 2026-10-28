<?php
/**
 * @var callable $e
 * @var string $filter
 * @var list<array<string,mixed>> $orders
 * @var array<string,int> $counts
 * @var list<array{id:int,name:string,stock:int}> $low
 */
use App\Facturo\Money;
use App\Format;
use App\ShopLokal\Orders;

$filters = ['todo' => 'À traiter', 'unpaid' => 'Non payées', 'done' => 'Terminées', 'all' => 'Toutes'];
?>
<?php if ($low !== []): ?>
  <section class="card">
    <p class="small"><strong>Stock bas :</strong>
      <?php foreach ($low as $i => $p): ?><?= $i > 0 ? ' · ' : '' ?><a href="/app.php?m=shoplokal&amp;p=products"><?= $e($p['name']) ?></a> (<?= (int) $p['stock'] ?>)<?php endforeach; ?></p>
  </section>
<?php endif; ?>
<section class="card">
  <nav class="filter-tabs" aria-label="Filtres">
    <?php foreach ($filters as $k => $label): ?>
      <a href="/app.php?m=shoplokal&amp;f=<?= $e($k) ?>"<?= $filter === $k ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?> <span class="count"><?= (int) $counts[$k] ?></span></a>
    <?php endforeach; ?>
  </nav>
  <?php if ($orders === []): ?>
    <p class="muted"><?= $filter === 'todo' ? 'Aucune commande à traiter.' : 'Aucune commande.' ?></p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>N°</th><th>Date</th><th>Client</th><th class="num">Articles</th><th class="num">Total</th><th>Paiement</th><th>Livraison</th><th>Statut</th></tr></thead>
      <tbody>
        <?php foreach ($orders as $o): ?>
          <tr>
            <td><a href="/app.php?m=shoplokal&amp;p=order&amp;id=<?= (int) $o['id'] ?>">#<?= (int) $o['number'] ?></a></td>
            <td><?= $e(Format::dateTime((string) $o['created_at'])) ?></td>
            <td><?= $e($o['customer_name']) ?></td>
            <td class="num"><?= (int) $o['items'] ?></td>
            <td class="num"><?= $e(Money::format((int) $o['total_cents'], 'MUR')) ?></td>
            <td><?= $e(Orders::PAYMENTS[$o['payment_method']]) ?> · <?= $o['paid_at'] !== null ? '<span class="pos">payée</span>' : '<span class="muted">non payée</span>' ?></td>
            <td><?= $o['delivery_method'] === 'pickup' ? 'Retrait' : 'Livraison' ?></td>
            <td><span class="status status--sl-<?= $e($o['status']) ?>"><?= $e(Orders::STATUSES[$o['status']]) ?></span></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
