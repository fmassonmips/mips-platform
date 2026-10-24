<?php
/**
 * Rendered quote/invoice body, shared by the in-app view and the print page.
 * Uses the seller/client snapshots frozen at issue time.
 *
 * @var callable $e
 * @var array<string,mixed> $doc
 */
use App\Facturo\Money;

$seller   = is_array($doc['seller']) ? $doc['seller'] : [];
$client   = is_array($doc['client']) ? $doc['client'] : [];
$isQuote  = $doc['type'] === 'quote';
$isCredit = $doc['type'] === 'credit_note';
$cur      = (string) $doc['currency'];
$title    = $isQuote ? 'Quotation' : ($isCredit ? 'Credit Note' : (($seller['vat_number'] ?? '') !== '' ? 'VAT Invoice' : 'Invoice'));
?>
<article class="doc">
  <header class="doc-head">
    <div>
      <strong class="doc-seller"><?= $e(($seller['legal_name'] ?? '') !== '' ? $seller['legal_name'] : ($seller['name'] ?? '')) ?></strong>
      <?php if (($seller['address'] ?? '') !== ''): ?><div class="pre"><?= $e($seller['address']) ?></div><?php endif; ?>
      <?php if (($seller['brn'] ?? '') !== ''): ?><div>BRN: <?= $e($seller['brn']) ?></div><?php endif; ?>
      <?php if (($seller['vat_number'] ?? '') !== ''): ?><div>VAT No: <?= $e($seller['vat_number']) ?></div><?php endif; ?>
      <?php if (($seller['email'] ?? '') !== ''): ?><div><?= $e($seller['email']) ?></div><?php endif; ?>
      <?php if (($seller['phone'] ?? '') !== ''): ?><div><?= $e($seller['phone']) ?></div><?php endif; ?>
    </div>
    <div class="doc-meta">
      <h2><?= $e($title) ?></h2>
      <div><strong><?= $e($doc['number']) ?></strong></div>
      <div>Date: <?= $e($doc['issue_date']) ?></div>
      <?php if ($isCredit && isset($doc['source']['number'])): ?>
        <div>Relating to invoice <?= $e($doc['source']['number']) ?></div>
      <?php endif; ?>
      <?php if ($doc['due_date'] !== null): ?>
        <div><?= $isQuote ? 'Valid until' : 'Due date' ?>: <?= $e($doc['due_date']) ?></div>
      <?php endif; ?>
    </div>
  </header>

  <section class="doc-client">
    <div class="muted small"><?= $isQuote ? 'Quotation for' : ($isCredit ? 'Credit to' : 'Bill to') ?></div>
    <strong><?= $e($client['name'] ?? '') ?></strong>
    <?php if (!empty($client['address'])): ?><div class="pre"><?= $e($client['address']) ?></div><?php endif; ?>
    <?php if (!empty($client['brn'])): ?><div>BRN: <?= $e($client['brn']) ?></div><?php endif; ?>
    <?php if (!empty($client['vat_number'])): ?><div>VAT No: <?= $e($client['vat_number']) ?></div><?php endif; ?>
  </section>

  <table class="table">
    <thead>
      <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">VAT</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>
      <?php foreach ($doc['lines'] as $l): ?>
        <tr>
          <td><?= $e($l['description']) ?></td>
          <td class="num"><?= $e(Money::quantityToInput($l['quantity_milli'])) ?></td>
          <td class="num"><?= $e(Money::format($l['unit_price_cents'], $cur)) ?></td>
          <td class="num"><?= $e(Money::rateToInput($l['tax_rate_bp'])) ?>%</td>
          <td class="num"><?= $e(Money::format($l['line_total_cents'], $cur)) ?></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <dl class="totals">
    <dt>Subtotal</dt><dd><?= $e(Money::format((int) $doc['subtotal_cents'], $cur)) ?></dd>
    <dt>VAT</dt><dd><?= $e(Money::format((int) $doc['tax_cents'], $cur)) ?></dd>
    <dt><?= $isCredit ? 'Total credited' : 'Total' ?></dt><dd><strong><?= $e(Money::format((int) $doc['total_cents'], $cur)) ?></strong></dd>
  </dl>

  <?php if ($doc['notes'] !== null && $doc['notes'] !== ''): ?>
    <section class="doc-notes pre"><?= $e($doc['notes']) ?></section>
  <?php endif; ?>
</article>
