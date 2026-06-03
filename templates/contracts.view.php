<?php
/**
 * Policies list + create/edit modal.
 * @var array<string,mixed> $user
 * @var string $csrf_token
 * @var string $active
 * @var string $page_title
 * @var array<int,array{id:int,name:string}> $clientOptions
 */
declare(strict_types=1);

use App\I18n;
use App\Models\Contract;

$t = static fn (string $k): string => htmlspecialchars(I18n::t($k), ENT_QUOTES, 'UTF-8');
$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/partials/header.php';
?>

<div class="page-head">
  <div>
    <h1><?= $t('contracts.title') ?></h1>
    <p class="muted"><?= $t('contracts.subtitle') ?></p>
  </div>
  <div class="page-actions">
    <input id="search" class="search-input" type="search" placeholder="<?= $t('contracts.search') ?>" autocomplete="off">
    <select id="status-filter" class="filter-select">
      <option value=""><?= $t('common.all') ?></option>
      <?php foreach (Contract::STATUSES as $s): ?>
        <option value="<?= $e($s) ?>"><?= $t('contract.status.' . $s) ?></option>
      <?php endforeach; ?>
    </select>
    <button id="new-btn" type="button" class="btn-primary"><?= $t('contracts.new') ?></button>
  </div>
</div>

<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th><?= $t('contract.client') ?></th>
        <th><?= $t('contract.policy_number') ?></th>
        <th><?= $t('contract.insurer') ?></th>
        <th><?= $t('contract.type') ?></th>
        <th class="num"><?= $t('contract.premium') ?></th>
        <th><?= $t('contract.end_date') ?></th>
        <th><?= $t('contract.status') ?></th>
        <th class="actions-col"><?= $t('common.actions') ?></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <p id="loading" class="empty-state"><?= $t('common.loading') ?></p>
  <p id="empty" class="empty-state" hidden><?= $t('contracts.empty') ?></p>
</div>

<div id="contract-modal" class="modal hidden">
  <div class="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="contract-modal-title">
    <div class="modal-head">
      <h2 id="contract-modal-title"></h2>
      <button type="button" class="modal-close" data-close aria-label="<?= $t('common.close') ?>">&times;</button>
    </div>
    <form id="contract-form" novalidate>
      <input type="hidden" name="id">
      <div class="form-grid">
        <div class="field span-2">
          <label for="ct-client"><?= $t('contract.client') ?> *</label>
          <select id="ct-client" name="client_id" required>
            <option value=""><?= $t('common.none') ?></option>
            <?php foreach ($clientOptions as $opt): ?>
              <option value="<?= (int) $opt['id'] ?>"><?= $e($opt['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="ct-policy"><?= $t('contract.policy_number') ?> *</label>
          <input id="ct-policy" name="policy_number" type="text" maxlength="80" required>
        </div>
        <div class="field">
          <label for="ct-insurer"><?= $t('contract.insurer') ?> *</label>
          <input id="ct-insurer" name="insurer" type="text" maxlength="160" required>
        </div>
        <div class="field">
          <label for="ct-type"><?= $t('contract.type') ?></label>
          <select id="ct-type" name="type">
            <?php foreach (Contract::TYPES as $ty): ?>
              <option value="<?= $e($ty) ?>"><?= $t('contract.type.' . $ty) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="ct-status"><?= $t('contract.status') ?></label>
          <select id="ct-status" name="status">
            <?php foreach (Contract::STATUSES as $s): ?>
              <option value="<?= $e($s) ?>"><?= $t('contract.status.' . $s) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="ct-premium"><?= $t('contract.premium') ?></label>
          <input id="ct-premium" name="premium" type="number" step="0.01" min="0" value="0">
        </div>
        <div class="field">
          <label for="ct-commission"><?= $t('contract.commission_rate') ?></label>
          <input id="ct-commission" name="commission_rate" type="number" step="0.01" min="0" max="100" value="0">
        </div>
        <div class="field">
          <label for="ct-start"><?= $t('contract.start_date') ?> *</label>
          <input id="ct-start" name="start_date" type="date" required>
        </div>
        <div class="field">
          <label for="ct-end"><?= $t('contract.end_date') ?> *</label>
          <input id="ct-end" name="end_date" type="date" required>
        </div>
        <div class="field span-2">
          <label for="ct-notes"><?= $t('contract.notes') ?></label>
          <textarea id="ct-notes" name="notes" rows="2" maxlength="5000"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" data-close><?= $t('common.cancel') ?></button>
        <button type="submit" class="btn-primary" id="contract-save"><?= $t('common.save') ?></button>
      </div>
    </form>
  </div>
</div>

<?php
$page_script = 'contracts.js';
require TEMPLATES_PATH . '/partials/footer.php';
