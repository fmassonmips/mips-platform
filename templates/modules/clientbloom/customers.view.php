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
    <h2>Customers</h2>
    <div class="actions">
      <?php if ($can_manage): ?>
        <a class="btn-secondary" href="/clientbloom/export.php?s=<?= $e(rawurlencode($segment)) ?>">Export CSV</a>
      <?php endif; ?>
      <a class="btn-secondary" href="/app.php?m=clientbloom&amp;p=customer">New customer</a>
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
    <div class="field grow"><label for="q">Search</label>
      <input type="text" id="q" name="q" value="<?= $e($query) ?>" placeholder="Name, phone or email"></div>
    <button type="submit" class="btn-secondary">Filter</button>
  </form>

  <?php if ($customers === []): ?>
    <p class="muted">No customers in this view.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Name</th><th>Phone</th><th class="num">Visits</th><th class="num">Spent</th><th>Last visit</th><th class="num">Cashback</th></tr></thead>
        <tbody>
          <?php foreach ($customers as $c): ?>
            <tr>
              <td><a href="/app.php?m=clientbloom&amp;p=customer&amp;id=<?= (int) $c['id'] ?>"><?= $e($c['name']) ?></a>
                <?php if ($c['tags'] !== null): ?><span class="muted small">· <?= $e($c['tags']) ?></span><?php endif; ?></td>
              <td><?= $e($c['phone'] ?? '') ?></td>
              <td class="num"><?= (int) $c['visits'] ?></td>
              <td class="num"><?= $e(Money::format((int) $c['total_spent_cents'], 'MUR')) ?></td>
              <td><?= $e($c['last_visit_at'] !== null ? substr((string) $c['last_visit_at'], 0, 10) : '—') ?></td>
              <td class="num"><?= $e(Money::format((int) $c['balance_cents'], 'MUR')) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <p class="muted small"><?= count($customers) ?> customer(s)<?= count($customers) >= 200 ? ' — first 200 shown, refine the search' : '' ?></p>
  <?php endif; ?>
</section>
