<?php
/**
 * Quote requests list + create/edit modal + convert-to-policy modal.
 * @var array<string,mixed> $user
 * @var string $csrf_token
 * @var string $active
 * @var string $page_title
 * @var array<int,array{id:int,name:string}> $clientOptions
 */
declare(strict_types=1);

use App\I18n;
use App\Models\Contract;
use App\Models\Quote;

$t = static fn (string $k): string => htmlspecialchars(I18n::t($k), ENT_QUOTES, 'UTF-8');
$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/partials/header.php';
?>

<div class="page-head">
  <div>
    <h1><?= $t('quotes.title') ?></h1>
    <p class="muted"><?= $t('quotes.subtitle') ?></p>
  </div>
  <div class="page-actions">
    <input id="search" class="search-input" type="search" placeholder="<?= $t('quotes.search') ?>" autocomplete="off">
    <select id="status-filter" class="filter-select">
      <option value=""><?= $t('common.all') ?></option>
      <?php foreach (Quote::STATUSES as $s): ?>
        <option value="<?= $e($s) ?>"><?= $t('quote.status.' . $s) ?></option>
      <?php endforeach; ?>
    </select>
    <button id="new-btn" type="button" class="btn-primary"><?= $t('quotes.new') ?></button>
  </div>
</div>

<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th><?= $t('quote.reference') ?></th>
        <th><?= $t('quote.client') ?></th>
        <th><?= $t('quote.type') ?></th>
        <th class="num"><?= $t('quote.estimated_premium') ?></th>
        <th><?= $t('quote.status') ?></th>
        <th class="actions-col"><?= $t('common.actions') ?></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <p id="loading" class="empty-state"><?= $t('common.loading') ?></p>
  <p id="empty" class="empty-state" hidden><?= $t('quotes.empty') ?></p>
</div>

<!-- Quote create/edit -->
<div id="quote-modal" class="modal hidden">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="quote-modal-title">
    <div class="modal-head">
      <h2 id="quote-modal-title"></h2>
      <button type="button" class="modal-close" data-close aria-label="<?= $t('common.close') ?>">&times;</button>
    </div>
    <form id="quote-form" novalidate>
      <input type="hidden" name="id">
      <div class="form-grid">
        <div class="field span-2">
          <label for="q-client"><?= $t('quote.client') ?> *</label>
          <select id="q-client" name="client_id" required>
            <option value=""><?= $t('common.none') ?></option>
            <?php foreach ($clientOptions as $opt): ?>
              <option value="<?= (int) $opt['id'] ?>"><?= $e($opt['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="q-reference"><?= $t('quote.reference') ?> <span class="hint">(<?= $t('common.optional') ?>)</span></label>
          <input id="q-reference" name="reference" type="text" maxlength="40" autocomplete="off">
        </div>
        <div class="field">
          <label for="q-status"><?= $t('quote.status') ?></label>
          <select id="q-status" name="status">
            <?php foreach (Quote::STATUSES as $s): ?>
              <option value="<?= $e($s) ?>"><?= $t('quote.status.' . $s) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="q-type"><?= $t('quote.type') ?> *</label>
          <input id="q-type" name="type" type="text" maxlength="60" required>
        </div>
        <div class="field">
          <label for="q-premium"><?= $t('quote.estimated_premium') ?></label>
          <input id="q-premium" name="estimated_premium" type="number" step="0.01" min="0">
        </div>
        <div class="field span-2">
          <label for="q-details"><?= $t('quote.details') ?></label>
          <textarea id="q-details" name="details" rows="3" maxlength="5000"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" data-close><?= $t('common.cancel') ?></button>
        <button type="submit" class="btn-primary" id="quote-save"><?= $t('common.save') ?></button>
      </div>
    </form>
  </div>
</div>

<!-- Convert quote -> policy -->
<div id="convert-modal" class="modal hidden">
  <div class="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="convert-modal-title">
    <div class="modal-head">
      <h2 id="convert-modal-title"><?= $t('quote.convert') ?></h2>
      <button type="button" class="modal-close" data-close aria-label="<?= $t('common.close') ?>">&times;</button>
    </div>
    <form id="convert-form" novalidate>
      <input type="hidden" name="quote_id">
      <input type="hidden" name="client_id">
      <div class="form-grid">
        <div class="field">
          <label for="cv-policy"><?= $t('contract.policy_number') ?> *</label>
          <input id="cv-policy" name="policy_number" type="text" maxlength="80" required>
        </div>
        <div class="field">
          <label for="cv-insurer"><?= $t('contract.insurer') ?> *</label>
          <input id="cv-insurer" name="insurer" type="text" maxlength="160" required>
        </div>
        <div class="field">
          <label for="cv-type"><?= $t('contract.type') ?></label>
          <select id="cv-type" name="type">
            <?php foreach (Contract::TYPES as $ty): ?>
              <option value="<?= $e($ty) ?>"><?= $t('contract.type.' . $ty) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="cv-premium"><?= $t('contract.premium') ?></label>
          <input id="cv-premium" name="premium" type="number" step="0.01" min="0" value="0">
        </div>
        <div class="field">
          <label for="cv-commission"><?= $t('contract.commission_rate') ?></label>
          <input id="cv-commission" name="commission_rate" type="number" step="0.01" min="0" max="100" value="0">
        </div>
        <div class="field">
          <label for="cv-start"><?= $t('contract.start_date') ?> *</label>
          <input id="cv-start" name="start_date" type="date" required>
        </div>
        <div class="field">
          <label for="cv-end"><?= $t('contract.end_date') ?> *</label>
          <input id="cv-end" name="end_date" type="date" required>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" data-close><?= $t('common.cancel') ?></button>
        <button type="submit" class="btn-primary" id="convert-save"><?= $t('quote.convert') ?></button>
      </div>
    </form>
  </div>
</div>

<?php
$page_script = 'quotes.js';
require TEMPLATES_PATH . '/partials/footer.php';
