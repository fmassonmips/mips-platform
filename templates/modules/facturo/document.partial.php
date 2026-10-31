<?php
/**
 * Rendered quote/invoice body, shared by the in-app view and the print page.
 * Uses the seller/client snapshots frozen at issue time.
 *
 * @var callable $e
 * @var array<string,mixed> $doc
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$seller   = is_array($doc['seller']) ? $doc['seller'] : [];
$client   = is_array($doc['client']) ? $doc['client'] : [];
$isQuote  = $doc['type'] === 'quote';
$isCredit = $doc['type'] === 'credit_note';
$cur      = (string) $doc['currency'];
$t        = Documents::text($doc);
$title    = $isQuote ? $t['quote'] : ($isCredit ? $t['credit_note'] : (($seller['vat_number'] ?? '') !== '' ? $t['vat_invoice'] : $t['invoice']));
?>
<article class="doc" lang="<?= $e(Documents::language($doc)) ?>">
  <header class="doc-head">
    <div>
      <strong class="doc-seller"><?= $e(($seller['legal_name'] ?? '') !== '' ? $seller['legal_name'] : ($seller['name'] ?? '')) ?></strong>
      <?php if (($seller['address'] ?? '') !== ''): ?><div class="pre"><?= $e($seller['address']) ?></div><?php endif; ?>
      <?php if (($seller['brn'] ?? '') !== ''): ?><div>BRN<?= $e($t['colon']) ?> <?= $e($seller['brn']) ?></div><?php endif; ?>
      <?php if (($seller['vat_number'] ?? '') !== ''): ?><div><?= $e($t['vat_no']) ?><?= $e($t['colon']) ?> <?= $e($seller['vat_number']) ?></div><?php endif; ?>
      <?php if (($seller['email'] ?? '') !== ''): ?><div><?= $e($seller['email']) ?></div><?php endif; ?>
      <?php if (($seller['phone'] ?? '') !== ''): ?><div><?= $e($seller['phone']) ?></div><?php endif; ?>
    </div>
    <div class="doc-meta">
      <h2><?= $e($title) ?></h2>
      <div><strong><?= $e($doc['number']) ?></strong></div>
      <div><?= $e($t['date']) ?><?= $e($t['colon']) ?> <?= $e(\App\Format::date($doc['issue_date'])) ?></div>
      <?php if ($isCredit && isset($doc['source']['number'])): ?>
        <div><?= $e($t['relates_to']) ?> <?= $e($doc['source']['number']) ?></div>
      <?php endif; ?>
      <?php if ($doc['due_date'] !== null): ?>
        <div><?= $e($isQuote ? $t['valid_until'] : $t['due']) ?><?= $e($t['colon']) ?> <?= $e(\App\Format::date($doc['due_date'])) ?></div>
      <?php endif; ?>
    </div>
  </header>

  <section class="doc-client">
    <div class="muted small"><?= $e($isQuote ? $t['to_quote'] : ($isCredit ? $t['to_credit_note'] : $t['to_invoice'])) ?></div>
    <strong><?= $e($client['name'] ?? '') ?></strong>
    <?php if (!empty($client['address'])): ?><div class="pre"><?= $e($client['address']) ?></div><?php endif; ?>
    <?php if (!empty($client['brn'])): ?><div>BRN<?= $e($t['colon']) ?> <?= $e($client['brn']) ?></div><?php endif; ?>
    <?php if (!empty($client['vat_number'])): ?><div><?= $e($t['vat_no']) ?><?= $e($t['colon']) ?> <?= $e($client['vat_number']) ?></div><?php endif; ?>
  </section>

  <table class="table">
    <thead>
      <tr><th><?= $e($t['description']) ?></th><th class="num"><?= $e($t['qty']) ?></th><th class="num"><?= $e($t['unit_price']) ?></th><th class="num"><?= $e($t['vat']) ?></th><th class="num"><?= $e($t['amount']) ?></th></tr>
    </thead>
    <tbody>
      <?php foreach ($doc['lines'] as $l): ?>
        <tr>
          <td><?= $e($l['description']) ?></td>
          <td class="num"><?= $e(Money::quantityToInput($l['quantity_milli'])) ?></td>
          <td class="num"><?= $e(Money::format($l['unit_price_cents'], $cur)) ?></td>
          <td class="num"><?= $e($l['tax_code'] === 'TC03' ? $t['exempt'] : Money::rateToInput($l['tax_rate_bp']) . $t['percent']) ?></td>
          <td class="num"><?= $e(Money::format($l['line_total_cents'], $cur)) ?></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <dl class="totals">
    <dt><?= $e($t['subtotal']) ?></dt><dd><?= $e(Money::format((int) $doc['subtotal_cents'], $cur)) ?></dd>
    <dt><?= $e($t['vat']) ?></dt><dd><?= $e(Money::format((int) $doc['tax_cents'], $cur)) ?></dd>
    <dt><?= $e($isCredit ? $t['total_credited'] : $t['total']) ?></dt><dd><strong><?= $e(Money::format((int) $doc['total_cents'], $cur)) ?></strong></dd>
  </dl>

  <?php if ($doc['notes'] !== null && $doc['notes'] !== ''): ?>
    <section class="doc-notes pre"><?php if ($isCredit): ?><strong><?= $e($t['reason']) ?></strong> <?php endif; ?><?= $e($doc['notes']) ?></section>
  <?php endif; ?>

  <?php if ($doc['mra_status'] === 'fiscalised' && $doc['mra_qr'] !== null): ?>
    <section class="doc-mra">
      <img src="data:image/png;base64,<?= $e($doc['mra_qr']) ?>" alt="<?= $e($t['mra_qr']) ?>">
      <div><?= $e($t['mra_ok']) ?><br>IRN<?= $e($t['colon']) ?> <?= $e($doc['mra_irn']) ?></div>
    </section>
  <?php elseif (in_array($doc['mra_status'], ['pending', 'rejected'], true)): ?>
    <p class="mra-warning"><?= $e($t['mra_pending']) ?></p>
  <?php endif; ?>
</article>
