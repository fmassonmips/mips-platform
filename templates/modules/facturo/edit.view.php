<?php
/**
 * Draft editor (new or existing draft).
 *
 * @var callable $e
 * @var string $type
 * @var array<string,mixed>|null $doc
 * @var list<array<string,mixed>> $clients
 * @var array<string,string> $profile
 * @var array{id:int,name:string,role:string} $org
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$isQuote     = $type === 'quote';
$isCredit    = $type === 'credit_note';
$titles      = [
    'quote'       => ['new' => 'Nouveau devis', 'draft' => 'Devis brouillon'],
    'invoice'     => ['new' => 'Nouvelle facture', 'draft' => 'Facture brouillon'],
    'credit_note' => ['new' => 'Nouvel avoir', 'draft' => 'Avoir brouillon'],
];
$issueLabels = ['quote' => 'Marquer comme envoyé', 'invoice' => 'Émettre la facture', 'credit_note' => 'Émettre l\'avoir'];
$issueConfirm = [
    'quote'       => 'Envoyer ce devis ? Il reçoit un numéro et ne pourra plus être modifié.',
    'invoice'     => 'Émettre cette facture ? Elle reçoit un numéro et ne pourra plus être modifiée.',
    'credit_note' => 'Émettre cet avoir ? Il reçoit un numéro et ne pourra plus être modifié.',
];
$blankLine   = [
    'description' => '', 'quantity_milli' => 1000, 'unit_price_cents' => 0,
    'tax_code' => $profile['vat_number'] !== '' ? 'TC01' : 'TC03', 'nature' => 'SERVICES',
];
$lines = $doc['lines'] ?? [$blankLine];

/** One editable line; also used for the "Add line" template. */
$lineRow = static function (array $l) use ($e): string {
    $tax = '';
    foreach (Documents::TAX_CODES as $code => $t) {
        $tax .= '<option value="' . $code . '" data-rate="' . $t['rate_bp'] . '"' . ($l['tax_code'] === $code ? ' selected' : '') . '>'
              . $e($t['label']) . '</option>';
    }
    $nature = '';
    foreach (Documents::NATURES as $code => $label) {
        $nature .= '<option value="' . $code . '"' . ($l['nature'] === $code ? ' selected' : '') . '>' . $e($label) . '</option>';
    }
    return '<tr class="line">'
        . '<td><input type="text" name="description" maxlength="500" value="' . $e($l['description']) . '" aria-label="Description"></td>'
        . '<td><select name="nature" aria-label="Bien ou service">' . $nature . '</select></td>'
        . '<td><input type="text" inputmode="decimal" name="quantity" value="' . $e(Money::quantityToInput((int) $l['quantity_milli'])) . '" aria-label="Quantité"></td>'
        . '<td><input type="text" inputmode="decimal" name="unit_price" value="' . $e(Money::toInput((int) $l['unit_price_cents'])) . '" aria-label="Prix unitaire"></td>'
        . '<td><select name="tax_code" aria-label="TVA">' . $tax . '</select></td>'
        . '<td class="num line-amount"></td>'
        . '<td><button type="button" class="btn-link" data-remove-line aria-label="Supprimer la ligne">✕</button></td>'
        . '</tr>';
};
?>
<section class="card">
  <div class="card-head">
    <h2><?= $e($titles[$type][$doc === null ? 'new' : 'draft']) ?></h2>
    <?php if ($doc !== null): ?>
      <span class="status status--draft"><?= $e(Documents::STATUS_LABELS['draft']) ?></span>
    <?php endif; ?>
  </div>

  <?php if ($isCredit): ?>
    <p class="muted">Avoir sur la facture <strong><?= $e($doc['source']['number'] ?? '') ?></strong>.
       Gardez les lignes pour annuler toute la facture, ou réduisez-les pour un avoir partiel.</p>
  <?php endif; ?>

  <?php if ($clients === []): ?>
    <p>Ajoutez d'abord un client : <a href="/app.php?m=facturo&amp;p=clients">Clients</a>.</p>
  <?php else: ?>
  <form id="document-form" novalidate
        data-id="<?= (int) ($doc['id'] ?? 0) ?>"
        data-type="<?= $e($type) ?>">
    <div class="form-grid">
      <div class="field">
        <label for="client_id">Client</label>
        <select id="client_id" name="client_id" required<?= $isCredit ? ' disabled' : '' ?>>
          <option value="">Choisir…</option>
          <?php foreach ($clients as $c): ?>
            <option value="<?= (int) $c['id'] ?>"<?= (int) ($doc['client_id'] ?? 0) === (int) $c['id'] ? ' selected' : '' ?>><?= $e($c['name']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="field">
        <label for="issue_date">Date</label>
        <input type="date" id="issue_date" name="issue_date" required value="<?= $e($doc['issue_date'] ?? date('Y-m-d')) ?>">
      </div>
      <?php if (!$isCredit): ?>
      <div class="field">
        <label for="due_date"><?= $isQuote ? 'Valable jusqu\'au' : 'Échéance' ?></label>
        <input type="date" id="due_date" name="due_date" value="<?= $e($doc['due_date'] ?? date('Y-m-d', strtotime('+30 days'))) ?>">
      </div>
      <?php endif; ?>
      <div class="field">
        <label for="currency">Devise</label>
        <select id="currency" name="currency"<?= $isCredit ? ' disabled' : '' ?>>
          <?php foreach (Money::CURRENCIES as $cur): ?>
            <option<?= ($doc['currency'] ?? 'MUR') === $cur ? ' selected' : '' ?>><?= $e($cur) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table class="table lines">
        <thead>
          <tr><th>Description</th><th>Type</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th>TVA</th><th class="num">Montant HT</th><th></th></tr>
        </thead>
        <tbody id="lines">
          <?php foreach ($lines as $l): ?>
            <?= $lineRow($l) ?>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <button type="button" id="add-line" class="btn-secondary">Ajouter une ligne</button>

    <dl class="totals">
      <dt>Total HT</dt><dd id="total-sub"></dd>
      <dt>TVA</dt><dd id="total-tax"></dd>
      <dt>Total TTC</dt><dd id="total-all"></dd>
    </dl>
    <p class="muted small">Les totaux sont recalculés par le serveur à l'enregistrement.</p>

    <div class="field">
      <label for="notes"><?= $isCredit ? 'Motif de l\'avoir (obligatoire pour la facturation électronique MRA)' : 'Notes (conditions de paiement, coordonnées bancaires…)' ?></label>
      <textarea id="notes" name="notes" rows="3" maxlength="5000"><?= $e($doc['notes'] ?? '') ?></textarea>
    </div>

    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer le brouillon</button>
      <?php if ($doc !== null): ?>
        <?php if ($isQuote || \App\Suite\Tenant::canManage($org)): ?>
          <button type="button" class="btn-secondary" data-doc-action="issue" data-id="<?= (int) $doc['id'] ?>"
                  data-confirm="<?= $e($issueConfirm[$type]) ?>">
            <?= $e($issueLabels[$type]) ?>
          </button>
        <?php else: ?>
          <span class="small muted">L’émission est réservée au propriétaire et aux administrateurs.</span>
        <?php endif; ?>
        <button type="button" class="btn-link" data-doc-action="delete" data-id="<?= (int) $doc['id'] ?>"
                data-confirm="Supprimer ce brouillon ?" data-redirect="/app.php?m=facturo&amp;p=<?= $isQuote ? 'quotes' : ($isCredit ? 'credit_notes' : 'invoices') ?>">Supprimer le brouillon</button>
      <?php endif; ?>
    </div>
  </form>

  <template id="line-template"><?= $lineRow($blankLine) ?></template>
  <?php endif; ?>
</section>
