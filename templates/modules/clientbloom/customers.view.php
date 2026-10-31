<?php
/**
 * @var callable $e
 * @var string $segment
 * @var string $query
 * @var list<array<string,mixed>> $customers
 * @var bool $can_manage
 */
use App\ClientBloom\Customers;
use App\Facturo\Money;
?>
<section class="card">
  <div class="card-head">
    <h2>Clients</h2>
    <div class="actions">
      <?php if ($can_manage): ?>
        <a class="btn-secondary" href="/clientbloom/export.php?s=<?= $e(rawurlencode($segment)) ?>">Exporter (CSV)</a>
      <?php endif; ?>
      <a class="btn-secondary" href="/app.php?m=clientbloom&amp;p=customer">Nouveau client</a>
    </div>
  </div>

  <form class="inline-form" method="get" action="/app.php">
    <input type="hidden" name="m" value="clientbloom"><input type="hidden" name="p" value="customers">
    <div class="field"><label for="seg">Segment</label>
      <select id="seg" name="s">
        <?php foreach (Customers::SEGMENTS as $key => $label): ?>
          <option value="<?= $e($key) ?>"<?= $segment === $key ? ' selected' : '' ?>><?= $e($label) ?></option>
        <?php endforeach; ?>
      </select></div>
    <div class="field grow"><label for="q">Rechercher</label>
      <input type="text" id="q" name="q" value="<?= $e($query) ?>" placeholder="Nom, téléphone ou e-mail"></div>
    <button type="submit" class="btn-secondary">Filtrer</button>
  </form>

  <?php if ($customers === []): ?>
    <p class="muted">Aucun client dans cette vue.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nom</th><th>Téléphone</th><th class="num">Visites</th><th class="num">Dépensé</th><th>Dernière visite</th><th class="num">Cashback</th></tr></thead>
        <tbody>
          <?php foreach ($customers as $c): ?>
            <tr>
              <td><a href="/app.php?m=clientbloom&amp;p=customer&amp;id=<?= (int) $c['id'] ?>"><?= $e($c['name']) ?></a>
                <?php if ($c['tags'] !== null): ?><span class="muted small">· <?= $e($c['tags']) ?></span><?php endif; ?></td>
              <td><?= $e($c['phone'] ?? '') ?></td>
              <td class="num"><?= (int) $c['visits'] ?></td>
              <td class="num"><?= $e(Money::format((int) $c['total_spent_cents'], 'MUR')) ?></td>
              <td><?= $e(\App\Format::date($c['last_visit_at'])) ?></td>
              <td class="num"><?= $e(Money::format((int) $c['balance_cents'], 'MUR')) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <p class="muted small"><?= count($customers) ?> client(s)<?= count($customers) >= 200 ? ' — 200 premiers affichés, affinez la recherche' : '' ?></p>
  <?php endif; ?>
</section>
