<?php
/**
 * Issued quote/invoice/credit note: read-only view with lifecycle actions,
 * related credit notes, and e-mail sending.
 *
 * @var callable $e
 * @var array<string,mixed> $doc
 * @var array{id:int,name:string,role:string} $org
 */
use App\Facturo\DocumentMailer;
use App\Facturo\Documents;
use App\Facturo\Money;

$id        = (int) $doc['id'];
$isQuote   = $doc['type'] === 'quote';
$isInvoice = $doc['type'] === 'invoice';
$status    = (string) $doc['status'];
$cur       = (string) $doc['currency'];
$mail      = DocumentMailer::defaults($org['id'], $doc);
$sent      = DocumentMailer::history($org['id'], $id);
$canCredit = $isInvoice && in_array($status, ['issued', 'paid'], true)
             && Documents::creditableCents($org['id'], $id) > 0;
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

      <?php if ($canCredit): ?>
        <button type="button" class="btn-secondary" data-doc-action="credit" data-id="<?= $id ?>">Credit note</button>
      <?php endif; ?>

      <?php if ($isInvoice && $status === 'issued'): ?>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="paid" data-id="<?= $id ?>">Mark paid</button>
      <?php endif; ?>
      <?php if ($isInvoice && $status === 'paid'): ?>
        <button type="button" class="btn-link" data-doc-action="status" data-status="issued" data-id="<?= $id ?>"
                data-confirm="Mark this invoice as unpaid again?">Mark unpaid</button>
      <?php endif; ?>
    </div>
  </div>

  <?php if ($doc['mra_status'] !== null): ?>
    <div class="mra-box mra-box--<?= $e($doc['mra_status']) ?>">
      <?php if ($doc['mra_status'] === 'fiscalised'): ?>
        <span><strong>MRA:</strong> fiscalised on <?= $e($doc['mra_fiscalised_at']) ?> · IRN <?= $e($doc['mra_irn']) ?></span>
      <?php else: ?>
        <span>
          <strong>MRA:</strong>
          <?= $doc['mra_status'] === 'pending' ? 'waiting to be fiscalised (MRA unreachable, retried automatically).' : 'rejected.' ?>
          <?php if ($doc['mra_error'] !== null): ?><br><span class="small"><?= $e($doc['mra_error']) ?></span><?php endif; ?>
        </span>
        <button type="button" class="btn-secondary" data-doc-action="mra" data-id="<?= $id ?>">Send to MRA now</button>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <?php if ($doc['clientbloom_note'] !== null): ?>
    <?php $loyaltyTx = $doc['clientbloom_tx_id'] !== null ? \App\ClientBloom\Ledger::transaction($org['id'], (int) $doc['clientbloom_tx_id']) : null; ?>
    <div class="related">
      <?= $e($doc['clientbloom_note']) ?>
      <?php if ($loyaltyTx !== null && \App\Suite\Modules::isEnabled($org['id'], 'clientbloom')): ?>
        <a href="/app.php?m=clientbloom&amp;p=customer&amp;id=<?= (int) $loyaltyTx['customer_id'] ?>">View in ClientBloom</a>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <?php if ($isInvoice && $doc['credit_notes'] !== []): ?>
    <div class="related">
      <strong>Credit notes:</strong>
      <?php foreach ($doc['credit_notes'] as $cn): ?>
        <a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $cn['id'] ?>"><?= $e($cn['number'] ?? 'Draft') ?></a>
        (<?= $e(Money::format((int) $cn['total_cents'], $cur)) ?>, <?= $e($cn['status']) ?>)
      <?php endforeach; ?>
      <div>Balance after credits:
        <strong><?= $e(Money::format((int) $doc['total_cents'] - (int) $doc['credited_cents'], $cur)) ?></strong></div>
    </div>
  <?php endif; ?>

  <?php require TEMPLATES_PATH . '/modules/facturo/document.partial.php'; ?>
</section>

<section class="card">
  <details class="send"<?= $sent === [] ? ' open' : '' ?>>
    <summary><strong>Send by e-mail</strong></summary>
    <form id="email-form" novalidate data-id="<?= $id ?>">
      <div class="field"><label for="m-to">To</label>
        <input type="email" id="m-to" name="to" maxlength="254" required value="<?= $e($mail['to']) ?>"></div>
      <div class="field"><label for="m-subject">Subject</label>
        <input type="text" id="m-subject" name="subject" maxlength="250" required value="<?= $e($mail['subject']) ?>"></div>
      <div class="field"><label for="m-message">Message</label>
        <textarea id="m-message" name="message" rows="6" maxlength="5000"><?= $e($mail['message']) ?></textarea></div>
      <p class="muted small">The e-mail includes a private link where your client can view, print or download the document.</p>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Send</button></div>
    </form>
  </details>

  <?php if ($sent !== []): ?>
    <ul class="send-log">
      <?php foreach ($sent as $s): ?>
        <li class="<?= $s['status'] === 'sent' ? '' : 'error-text' ?>">
          <?= $s['status'] === 'sent' ? 'Sent to' : 'Failed to send to' ?> <?= $e($s['recipient']) ?>
          · <?= $e($s['created_at']) ?>
        </li>
      <?php endforeach; ?>
    </ul>
  <?php endif; ?>
</section>
