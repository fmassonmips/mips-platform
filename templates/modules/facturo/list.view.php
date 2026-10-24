<?php
/**
 * @var callable $e
 * @var string $type
 * @var list<array<string,mixed>> $documents
 */
use App\Facturo\Money;

$label = $type === 'quote' ? 'quote' : 'invoice';
?>
<section class="card">
  <div class="card-head">
    <h2><?= $type === 'quote' ? 'Quotes' : 'Invoices' ?></h2>
    <a class="btn-secondary" href="/app.php?m=facturo&amp;p=edit&amp;type=<?= $e($type) ?>">New <?= $e($label) ?></a>
  </div>

  <?php if ($documents === []): ?>
    <p class="muted">No <?= $e($label) ?> yet.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Number</th><th>Client</th><th>Date</th><th>Status</th><th class="num">Total</th></tr>
        </thead>
        <tbody>
          <?php foreach ($documents as $d): ?>
            <tr>
              <td><a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $d['id'] ?>"><?= $e($d['number'] ?? 'Draft') ?></a></td>
              <td><?= $e($d['client_name']) ?></td>
              <td><?= $e($d['issue_date']) ?></td>
              <td><span class="status status--<?= $e($d['status']) ?>"><?= $e($d['status']) ?></span></td>
              <td class="num"><?= $e(Money::format((int) $d['total_cents'], (string) $d['currency'])) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
