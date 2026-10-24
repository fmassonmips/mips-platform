<?php
/**
 * Issued quote/invoice: read-only view with lifecycle actions.
 *
 * @var callable $e
 * @var array<string,mixed> $doc
 */
$id      = (int) $doc['id'];
$isQuote = $doc['type'] === 'quote';
$status  = (string) $doc['status'];
?>
<section class="card">
  <div class="card-head">
    <span class="status status--<?= $e($status) ?>"><?= $e($status) ?></span>
    <div class="actions">
      <a class="btn-secondary" href="/facturo/print.php?id=<?= $id ?>" target="_blank" rel="noopener">Print / PDF</a>

      <?php if ($isQuote && $status === 'sent'): ?>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="accepted" data-id="<?= $id ?>">Mark accepted</button>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="declined" data-id="<?= $id ?>">Mark declined</button>
      <?php endif; ?>
      <?php if ($isQuote && in_array($status, ['accepted', 'declined'], true)): ?>
        <button type="button" class="btn-link" data-doc-action="status" data-status="sent" data-id="<?= $id ?>">Back to sent</button>
      <?php endif; ?>
      <?php if ($isQuote && in_array($status, ['sent', 'accepted'], true)): ?>
        <button type="button" class="btn-secondary" data-doc-action="convert" data-id="<?= $id ?>">Create invoice</button>
      <?php endif; ?>

      <?php if (!$isQuote && $status === 'issued'): ?>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="paid" data-id="<?= $id ?>">Mark paid</button>
      <?php endif; ?>
      <?php if (!$isQuote && $status === 'paid'): ?>
        <button type="button" class="btn-link" data-doc-action="status" data-status="issued" data-id="<?= $id ?>"
                data-confirm="Mark this invoice as unpaid again?">Mark unpaid</button>
      <?php endif; ?>
    </div>
  </div>

  <?php require TEMPLATES_PATH . '/modules/facturo/document.partial.php'; ?>
</section>
