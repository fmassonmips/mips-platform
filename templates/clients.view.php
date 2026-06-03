<?php
/**
 * Clients list + create/edit modal.
 * @var array<string,mixed> $user
 * @var string $csrf_token
 * @var string $active
 * @var string $page_title
 */
declare(strict_types=1);

use App\I18n;

$t = static fn (string $k): string => htmlspecialchars(I18n::t($k), ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/partials/header.php';
?>

<div class="page-head">
  <div>
    <h1><?= $t('clients.title') ?></h1>
    <p class="muted"><?= $t('clients.subtitle') ?></p>
  </div>
  <div class="page-actions">
    <input id="search" class="search-input" type="search" placeholder="<?= $t('clients.search') ?>" autocomplete="off">
    <button id="new-btn" type="button" class="btn-primary"><?= $t('clients.new') ?></button>
  </div>
</div>

<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th><?= $t('client.name') ?></th>
        <th><?= $t('client.type') ?></th>
        <th><?= $t('client.email') ?></th>
        <th><?= $t('client.phone') ?></th>
        <th class="num"><?= $t('client.col.policies') ?></th>
        <th class="actions-col"><?= $t('common.actions') ?></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <p id="loading" class="empty-state"><?= $t('common.loading') ?></p>
  <p id="empty" class="empty-state" hidden><?= $t('clients.empty') ?></p>
</div>

<div id="client-modal" class="modal hidden">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="client-modal-title">
    <div class="modal-head">
      <h2 id="client-modal-title"></h2>
      <button type="button" class="modal-close" data-close aria-label="<?= $t('common.close') ?>">&times;</button>
    </div>
    <form id="client-form" novalidate>
      <input type="hidden" name="id">
      <div class="form-grid">
        <div class="field">
          <label for="c-type"><?= $t('client.type') ?></label>
          <select id="c-type" name="type">
            <option value="individual"><?= $t('client.type.individual') ?></option>
            <option value="company"><?= $t('client.type.company') ?></option>
          </select>
        </div>
        <div class="field">
          <label for="c-name"><?= $t('client.name') ?> *</label>
          <input id="c-name" name="name" type="text" maxlength="160" required>
        </div>
        <div class="field">
          <label for="c-email"><?= $t('client.email') ?></label>
          <input id="c-email" name="email" type="email" maxlength="254" autocomplete="off">
        </div>
        <div class="field">
          <label for="c-phone"><?= $t('client.phone') ?></label>
          <input id="c-phone" name="phone" type="text" maxlength="40">
        </div>
        <div class="field">
          <label for="c-city"><?= $t('client.city') ?></label>
          <input id="c-city" name="city" type="text" maxlength="120">
        </div>
        <div class="field span-2">
          <label for="c-address"><?= $t('client.address') ?></label>
          <input id="c-address" name="address" type="text" maxlength="255">
        </div>
        <div class="field span-2">
          <label for="c-notes"><?= $t('client.notes') ?></label>
          <textarea id="c-notes" name="notes" rows="3" maxlength="5000"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" data-close><?= $t('common.cancel') ?></button>
        <button type="submit" class="btn-primary" id="client-save"><?= $t('common.save') ?></button>
      </div>
    </form>
  </div>
</div>

<?php
$page_script = 'clients.js';
require TEMPLATES_PATH . '/partials/footer.php';
