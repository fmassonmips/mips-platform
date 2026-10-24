<?php
/**
 * @var callable $e
 * @var string $type
 * @var list<array<string,mixed>> $documents
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$label = Documents::LABELS[$type];
?>
<section class="card">
  <div class="card-head">
    <h2><?= $e(ucfirst($label)) ?>s</h2>
    <?php if ($type === 'credit_note'): ?>
      <span class="muted small">Open an issued invoice and choose “Credit note”.</span>
    <?php else: ?>
      <a class="btn-secondary" href="/app.php?m=facturo&amp;p=edit&amp;type=<?= $e($type) ?>">New <?= $e($label) ?></a>
    <?php endif; ?>
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
