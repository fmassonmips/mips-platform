<?php
/**
 * Draft editor (new or existing draft).
 *
 * @var callable $e
 * @var string $type
 * @var array<string,mixed>|null $doc
 * @var list<array<string,mixed>> $clients
 * @var array<string,string> $profile
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$isQuote     = $type === 'quote';
$isCredit    = $type === 'credit_note';
$label       = Documents::LABELS[$type];
$defaultRate = $profile['vat_number'] !== '' ? '15' : '0';
$lines       = $doc['lines'] ?? [[
    'description' => '', 'quantity_milli' => 1000, 'unit_price_cents' => 0,
    'tax_rate_bp' => (int) $defaultRate * 100,
]];
?>
<section class="card">
  <div class="card-head">
    <h2><?= $e(($doc === null ? 'New ' : 'Draft ') . $label) ?></h2>
    <?php if ($doc !== null): ?>
      <span class="status status--draft">draft</span>
    <?php endif; ?>
  </div>

  <?php if ($isCredit): ?>
    <p class="muted">Credit note for invoice <strong><?= $e($doc['source']['number'] ?? '') ?></strong>.
       Keep the lines to cancel the invoice in full, or reduce them for a partial credit.</p>
  <?php endif; ?>

  <?php if ($clients === []): ?>
    <p>Add a client first: <a href="/app.php?m=facturo&amp;p=clients">Clients</a>.</p>
  <?php else: ?>
  <form id="document-form" novalidate
        data-id="<?= (int) ($doc['id'] ?? 0) ?>"
        data-type="<?= $e($type) ?>"
        data-default-rate="<?= $e($defaultRate) ?>">
    <div class="form-grid">
      <div class="field">
        <label for="client_id">Client</label>
        <select id="client_id" name="client_id" required<?= $isCredit ? ' disabled' : '' ?>>
          <option value="">Choose…</option>
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
        <label for="due_date"><?= $isQuote ? 'Valid until' : 'Due date' ?></label>
        <input type="date" id="due_date" name="due_date" value="<?= $e($doc['due_date'] ?? date('Y-m-d', strtotime('+30 days'))) ?>">
      </div>
      <?php endif; ?>
      <div class="field">
        <label for="currency">Currency</label>
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
          <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">VAT %</th><th class="num">Amount</th><th></th></tr>
        </thead>
        <tbody id="lines">
          <?php foreach ($lines as $l): ?>
            <tr class="line">
              <td><input type="text" name="description" maxlength="500" value="<?= $e($l['description']) ?>" aria-label="Description"></td>
              <td><input type="text" inputmode="decimal" name="quantity" value="<?= $e(Money::quantityToInput((int) $l['quantity_milli'])) ?>" aria-label="Quantity"></td>
              <td><input type="text" inputmode="decimal" name="unit_price" value="<?= $e(Money::toInput((int) $l['unit_price_cents'])) ?>" aria-label="Unit price"></td>
              <td><input type="text" inputmode="decimal" name="tax_rate" value="<?= $e(Money::rateToInput((int) $l['tax_rate_bp'])) ?>" aria-label="VAT rate"></td>
              <td class="num line-amount"></td>
              <td><button type="button" class="btn-link" data-remove-line aria-label="Remove line">✕</button></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <button type="button" id="add-line" class="btn-secondary">Add line</button>

    <dl class="totals">
      <dt>Subtotal</dt><dd id="total-sub"></dd>
      <dt>VAT</dt><dd id="total-tax"></dd>
      <dt>Total</dt><dd id="total-all"></dd>
    </dl>
    <p class="muted small">Totals are recalculated by the server when you save.</p>

    <div class="field">
      <label for="notes">Notes (payment terms, bank details…)</label>
      <textarea id="notes" name="notes" rows="3" maxlength="5000"><?= $e($doc['notes'] ?? '') ?></textarea>
    </div>

    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Save draft</button>
      <?php if ($doc !== null): ?>
        <button type="button" class="btn-secondary" data-doc-action="issue" data-id="<?= (int) $doc['id'] ?>"
                data-confirm="<?= $e(($isQuote ? 'Send this quote?' : 'Issue this ' . $label . '?') . ' It gets a number and can no longer be edited.') ?>">
          <?= $isQuote ? 'Mark as sent' : $e('Issue ' . $label) ?>
        </button>
        <button type="button" class="btn-link" data-doc-action="delete" data-id="<?= (int) $doc['id'] ?>"
                data-confirm="Delete this draft?" data-redirect="/app.php?m=facturo&amp;p=<?= $isQuote ? 'quotes' : ($isCredit ? 'credit_notes' : 'invoices') ?>">Delete draft</button>
      <?php endif; ?>
    </div>
  </form>

  <template id="line-template">
    <tr class="line">
      <td><input type="text" name="description" maxlength="500" aria-label="Description"></td>
      <td><input type="text" inputmode="decimal" name="quantity" value="1" aria-label="Quantity"></td>
      <td><input type="text" inputmode="decimal" name="unit_price" value="0.00" aria-label="Unit price"></td>
      <td><input type="text" inputmode="decimal" name="tax_rate" value="<?= $e($defaultRate) ?>" aria-label="VAT rate"></td>
      <td class="num line-amount"></td>
      <td><button type="button" class="btn-link" data-remove-line aria-label="Remove line">✕</button></td>
    </tr>
  </template>
  <?php endif; ?>
</section>
