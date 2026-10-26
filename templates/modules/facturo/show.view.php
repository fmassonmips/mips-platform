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
    <span class="status status--<?= $e($status) ?>"><?= $e(Documents::statusLabel((string) $doc['type'], $status)) ?></span>
    <div class="actions">
      <a class="btn-secondary" href="/facturo/print.php?id=<?= $id ?>" target="_blank" rel="noopener">Imprimer / PDF</a>

      <?php if ($isQuote && $status === 'sent'): ?>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="accepted" data-id="<?= $id ?>">Marquer accepté</button>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="declined" data-id="<?= $id ?>">Marquer refusé</button>
      <?php endif; ?>
      <?php if ($isQuote && in_array($status, ['accepted', 'declined'], true)): ?>
        <button type="button" class="btn-link" data-doc-action="status" data-status="sent" data-id="<?= $id ?>">Revenir à envoyé</button>
      <?php endif; ?>
      <?php if ($isQuote && in_array($status, ['sent', 'accepted'], true)): ?>
        <button type="button" class="btn-secondary" data-doc-action="convert" data-id="<?= $id ?>">Créer la facture</button>
      <?php endif; ?>

      <?php if ($canCredit): ?>
        <button type="button" class="btn-secondary" data-doc-action="credit" data-id="<?= $id ?>">Créer un avoir</button>
      <?php endif; ?>

      <?php if ($isInvoice && $status === 'issued'): ?>
        <button type="button" class="btn-secondary" data-doc-action="status" data-status="paid" data-id="<?= $id ?>">Marquer payée</button>
      <?php endif; ?>
      <?php if ($isInvoice && $status === 'paid'): ?>
        <button type="button" class="btn-link" data-doc-action="status" data-status="issued" data-id="<?= $id ?>"
                data-confirm="Marquer cette facture comme de nouveau impayée ?">Marquer impayée</button>
      <?php endif; ?>
    </div>
  </div>

  <?php if ($doc['mra_status'] !== null): ?>
    <div class="mra-box mra-box--<?= $e($doc['mra_status']) ?>">
      <?php if ($doc['mra_status'] === 'fiscalised'): ?>
        <span><strong>MRA :</strong> fiscalisé le <?= $e($doc['mra_fiscalised_at']) ?> · IRN <?= $e($doc['mra_irn']) ?></span>
      <?php else: ?>
        <span>
          <strong>MRA :</strong>
          <?= $doc['mra_status'] === 'pending' ? 'en attente de fiscalisation (MRA injoignable, nouvel essai automatique).' : 'rejeté.' ?>
          <?php if ($doc['mra_error'] !== null): ?><br><span class="small"><?= $e($doc['mra_error']) ?></span><?php endif; ?>
        </span>
        <button type="button" class="btn-secondary" data-doc-action="mra" data-id="<?= $id ?>">Envoyer à la MRA maintenant</button>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <?php if ($doc['clientbloom_note'] !== null): ?>
    <?php $loyaltyTx = $doc['clientbloom_tx_id'] !== null ? \App\ClientBloom\Ledger::transaction($org['id'], (int) $doc['clientbloom_tx_id']) : null; ?>
    <div class="related">
      <?= $e($doc['clientbloom_note']) ?>
      <?php if ($loyaltyTx !== null && \App\Suite\Modules::isEnabled($org['id'], 'clientbloom')): ?>
        <a href="/app.php?m=clientbloom&amp;p=customer&amp;id=<?= (int) $loyaltyTx['customer_id'] ?>">Voir dans ClientBloom</a>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <?php if ($isInvoice && $doc['credit_notes'] !== []): ?>
    <div class="related">
      <strong>Avoirs :</strong>
      <?php foreach ($doc['credit_notes'] as $cn): ?>
        <a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $cn['id'] ?>"><?= $e($cn['number'] ?? 'Brouillon') ?></a>
        (<?= $e(Money::format((int) $cn['total_cents'], $cur)) ?>, <?= $e(mb_strtolower(Documents::statusLabel('credit_note', (string) $cn['status']))) ?>)
      <?php endforeach; ?>
      <div>Solde après avoirs :
        <strong><?= $e(Money::format((int) $doc['total_cents'] - (int) $doc['credited_cents'], $cur)) ?></strong></div>
    </div>
  <?php endif; ?>

  <?php require TEMPLATES_PATH . '/modules/facturo/document.partial.php'; ?>
</section>

<section class="card">
  <details class="send"<?= $sent === [] ? ' open' : '' ?>>
    <summary><strong>Envoyer par e-mail</strong></summary>
    <form id="email-form" novalidate data-id="<?= $id ?>">
      <div class="field"><label for="m-to">Destinataire</label>
        <input type="email" id="m-to" name="to" maxlength="254" required value="<?= $e($mail['to']) ?>"></div>
      <div class="field"><label for="m-subject">Objet</label>
        <input type="text" id="m-subject" name="subject" maxlength="250" required value="<?= $e($mail['subject']) ?>"></div>
      <div class="field"><label for="m-message">Message</label>
        <textarea id="m-message" name="message" rows="6" maxlength="5000"><?= $e($mail['message']) ?></textarea></div>
      <p class="muted small">L'e-mail contient un lien privé où votre client peut consulter, imprimer ou télécharger le document.</p>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Envoyer</button></div>
    </form>
  </details>

  <?php if ($sent !== []): ?>
    <ul class="send-log">
      <?php foreach ($sent as $s): ?>
        <li class="<?= $s['status'] === 'sent' ? '' : 'error-text' ?>">
          <?= $s['status'] === 'sent' ? 'Envoyé à' : 'Échec de l\'envoi à' ?> <?= $e($s['recipient']) ?>
          · <?= $e($s['created_at']) ?>
        </li>
      <?php endforeach; ?>
    </ul>
  <?php endif; ?>
</section>
