<?php
/**
 * Client detail: profile card, interaction history (add inline), and tables
 * of linked policies and quotes.
 * @var array<string,mixed> $user
 * @var array<string,mixed> $client
 * @var string $csrf_token
 * @var string $active
 * @var string $page_title
 */
declare(strict_types=1);

use App\I18n;

$t = static fn (string $k): string => htmlspecialchars(I18n::t($k), ENT_QUOTES, 'UTF-8');
$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/partials/header.php';
?>

<p class="breadcrumb"><a href="/clients.php">&larr; <?= $t('clients.title') ?></a></p>

<div class="page-head" data-client-id="<?= (int) $client['id'] ?>">
  <div>
    <h1><?= $e((string) $client['name']) ?> <span id="client-type-badge" class="badge"></span></h1>
    <p class="muted"><?= $t('client.detail') ?></p>
  </div>
  <div class="page-actions">
    <button id="edit-client-btn" type="button" class="btn-secondary"><?= $t('common.edit') ?></button>
  </div>
</div>

<section class="card">
  <dl class="detail-grid" id="client-info"></dl>
</section>

<section class="card">
  <div class="card-head">
    <h2><?= $t('interactions.title') ?></h2>
  </div>

  <form id="interaction-form" class="inline-form" novalidate>
    <div class="form-grid">
      <div class="field">
        <label for="i-type"><?= $t('interaction.type') ?></label>
        <select id="i-type" name="type">
          <option value="note"><?= $t('interaction.type.note') ?></option>
          <option value="call"><?= $t('interaction.type.call') ?></option>
          <option value="email"><?= $t('interaction.type.email') ?></option>
          <option value="meeting"><?= $t('interaction.type.meeting') ?></option>
        </select>
      </div>
      <div class="field">
        <label for="i-date"><?= $t('interaction.date') ?></label>
        <input id="i-date" name="occurred_at" type="datetime-local">
      </div>
      <div class="field span-2">
        <label for="i-summary"><?= $t('interaction.summary') ?> *</label>
        <input id="i-summary" name="summary" type="text" maxlength="255" required>
      </div>
      <div class="field span-2">
        <label for="i-details"><?= $t('interaction.details') ?></label>
        <textarea id="i-details" name="details" rows="2" maxlength="5000"></textarea>
      </div>
    </div>
    <div class="form-actions left">
      <button type="submit" class="btn-primary" id="interaction-save"><?= $t('interactions.add') ?></button>
    </div>
  </form>

  <ul id="interactions" class="timeline"></ul>
  <p id="interactions-empty" class="empty-state" hidden><?= $t('interactions.empty') ?></p>
</section>

<section class="card">
  <div class="card-head"><h2><?= $t('client.contracts') ?></h2></div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th><?= $t('contract.policy_number') ?></th>
        <th><?= $t('contract.insurer') ?></th>
        <th><?= $t('contract.type') ?></th>
        <th class="num"><?= $t('contract.premium') ?></th>
        <th><?= $t('contract.end_date') ?></th>
        <th><?= $t('contract.status') ?></th>
      </tr></thead>
      <tbody id="client-contracts"></tbody>
    </table>
    <p id="contracts-empty" class="empty-state" hidden><?= $t('contracts.empty') ?></p>
  </div>
</section>

<section class="card">
  <div class="card-head"><h2><?= $t('client.quotes') ?></h2></div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th><?= $t('quote.reference') ?></th>
        <th><?= $t('quote.type') ?></th>
        <th class="num"><?= $t('quote.estimated_premium') ?></th>
        <th><?= $t('quote.status') ?></th>
      </tr></thead>
      <tbody id="client-quotes"></tbody>
    </table>
    <p id="quotes-empty" class="empty-state" hidden><?= $t('quotes.empty') ?></p>
  </div>
</section>

<div id="client-modal" class="modal hidden">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="client-modal-title">
    <div class="modal-head">
      <h2 id="client-modal-title"><?= $t('clients.edit') ?></h2>
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
          <input id="c-email" name="email" type="email" maxlength="254">
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
$page_script = 'client.js';
require TEMPLATES_PATH . '/partials/footer.php';
