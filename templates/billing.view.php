<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'billing';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card">
      <div class="card-head">
        <h2>Invoices</h2>
        <div class="toolbar">
          <label for="period-select" class="sr-only">Month</label>
          <select id="period-select"></select>
          <button id="generate-btn" type="button" class="btn-primary btn-auto">Generate drafts</button>
          <a id="export-link" class="btn-secondary" href="#">Export CSV</a>
        </div>
      </div>
      <p class="muted">Generating rebuilds the drafts of the month from imported transactions and the active fee rules.
        Issued and paid invoices are never changed; void one to regenerate it.
        Billing details (legal name, BRN, VAT, address, billing email, billable) are edited on each <a href="/merchants.php">merchant record</a>.</p>
      <p id="billing-msg" class="notice" role="status" hidden></p>
      <p id="billing-error" class="error" role="alert" hidden></p>
      <div id="invoices"></div>
    </section>

    <section class="card">
      <h2>Fee rules</h2>
      <p class="muted">Fee = volume &times; rate % + transactions &times; fixed fee. Empty criteria match anything;
        the most specific rule wins (merchant &gt; rail &gt; rail type &gt; channel). Rules are not edited: disable and recreate.</p>
      <form id="rule-form" class="grid-form" novalidate>
        <div class="field">
          <label for="rule-merchant">Merchant</label>
          <select id="rule-merchant" name="merchant_id"><option value="">Any merchant</option></select>
        </div>
        <div class="field">
          <label for="rule-nick">Rail (sof_proc_nickname)</label>
          <input type="text" id="rule-nick" name="sof_proc_nickname" placeholder="Any, e.g. MPGS">
        </div>
        <div class="field">
          <label for="rule-rail">Rail type</label>
          <select id="rule-rail" name="rail_type">
            <option value="">Any</option><option>CARD</option><option>QR</option><option>PUSH</option><option>OTHER</option>
          </select>
        </div>
        <div class="field">
          <label for="rule-channel">Channel</label>
          <select id="rule-channel" name="channel">
            <option value="">Any</option><option>TPE</option><option>ONLINE</option>
          </select>
        </div>
        <div class="field">
          <label for="rule-rate">Rate %</label>
          <input type="text" id="rule-rate" name="rate_pct" inputmode="decimal" placeholder="e.g. 2.5">
        </div>
        <div class="field">
          <label for="rule-fixed">Fixed fee / txn</label>
          <input type="text" id="rule-fixed" name="fixed_fee" inputmode="decimal" placeholder="0">
        </div>
        <div class="field">
          <label for="rule-from">Valid from</label>
          <input type="date" id="rule-from" name="valid_from" required>
        </div>
        <div class="field">
          <label for="rule-to">Valid to <span class="muted">(optional)</span></label>
          <input type="date" id="rule-to" name="valid_to">
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Add rule</button>
        </div>
      </form>
      <p id="rule-error" class="error" role="alert" hidden></p>
      <div id="rules"></div>
    </section>

  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/billing.js"></script>
</body>
</html>
