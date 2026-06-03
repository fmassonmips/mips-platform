<?php
/**
 * Dashboard overview: KPI cards, quotes-by-status, upcoming policy expiries
 * and recent quote requests.
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
    <h1><?= $t('dashboard.title') ?></h1>
    <p class="muted"><?= $t('dashboard.subtitle') ?></p>
  </div>
</div>

<div class="stat-grid">
  <a class="stat-card" href="/clients.php">
    <span class="stat-label"><?= $t('dashboard.clients') ?></span>
    <span class="stat-value" id="stat-clients">—</span>
  </a>
  <a class="stat-card" href="/contracts.php">
    <span class="stat-label"><?= $t('dashboard.active_contracts') ?></span>
    <span class="stat-value" id="stat-active">—</span>
  </a>
  <div class="stat-card">
    <span class="stat-label"><?= $t('dashboard.est_commission') ?></span>
    <span class="stat-value" id="stat-commission">—</span>
    <span class="stat-sub" id="stat-premium"></span>
  </div>
  <a class="stat-card" href="/quotes.php">
    <span class="stat-label"><?= $t('dashboard.open_quotes') ?></span>
    <span class="stat-value" id="stat-quotes">—</span>
  </a>
</div>

<div class="dash-cols">
  <section class="card">
    <div class="card-head"><h2><?= $t('dashboard.upcoming') ?></h2></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th><?= $t('contract.client') ?></th>
          <th><?= $t('contract.policy_number') ?></th>
          <th><?= $t('contract.end_date') ?></th>
          <th></th>
        </tr></thead>
        <tbody id="upcoming"></tbody>
      </table>
      <p id="upcoming-empty" class="empty-state" hidden><?= $t('dashboard.no_upcoming') ?></p>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2><?= $t('dashboard.quotes_by_status') ?></h2></div>
    <ul class="status-list" id="quotes-status"></ul>
  </section>
</div>

<section class="card">
  <div class="card-head"><h2><?= $t('dashboard.recent_quotes') ?></h2></div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th><?= $t('quote.reference') ?></th>
        <th><?= $t('quote.client') ?></th>
        <th><?= $t('quote.type') ?></th>
        <th class="num"><?= $t('quote.estimated_premium') ?></th>
        <th><?= $t('quote.status') ?></th>
      </tr></thead>
      <tbody id="recent-quotes"></tbody>
    </table>
    <p id="recent-empty" class="empty-state" hidden><?= $t('dashboard.no_quotes') ?></p>
  </div>
</section>

<?php
$page_script = 'dashboard.js';
require TEMPLATES_PATH . '/partials/footer.php';
