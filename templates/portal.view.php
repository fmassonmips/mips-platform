<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
/** @var \App\Domain\Role $role */
/** @var array<string,bool> $sections */
/** @var string $disclaimer */
$h = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $h($csrf_token) ?>">
  <title><?= $h($page_title) ?> &middot; PassPass</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <header class="app-header">
    <h1>PassPass <span class="muted">· powered by MIPSIT Digital Ltd</span></h1>
    <div class="user-info">
      <span>Signed in as <strong><?= $h((string) $user['email']) ?></strong>
        <span class="badge info"><?= $h($role->value) ?></span></span>
      <a class="btn-secondary" href="/dashboard.php">Dashboard</a>
      <button id="logout-btn" type="button" class="btn-secondary">Logout</button>
    </div>
  </header>

  <?php if ($disclaimer !== ''): ?>
  <div class="disclaimer"><strong>Sandbox.</strong> <?= $h($disclaimer) ?></div>
  <?php endif; ?>

  <main class="app-main">

    <?php if ($sections['kpis']): ?>
    <section class="card portal-section" data-section="kpis">
      <h2>Dashboard</h2>
      <div id="kpi-grid" class="muted">Loading…</div>
    </section>
    <?php endif; ?>

    <?php if ($sections['merchant']): ?>
    <section class="card portal-section" data-section="merchant">
      <h2>Merchant onboarding</h2>
      <div id="merchant-status" class="muted">Loading…</div>

      <form id="merchant-create" hidden class="stack">
        <p class="muted">You don't have a merchant account yet. Create one (PassPass issues your regulated merchant ID).</p>
        <div class="row">
          <div class="field"><label>Legal name</label><input type="text" name="legal_name" required></div>
          <div class="field"><label>Trading name</label><input type="text" name="trading_name"></div>
          <div class="field"><label>Business type</label><input type="text" name="business_type" value="Retail"></div>
        </div>
        <button class="btn-primary" type="submit">Create merchant</button>
      </form>

      <form id="kyc-submit" hidden class="stack">
        <p class="muted">Submit KYC to PassPass for review.</p>
        <button class="btn-primary" type="submit">Submit KYC for review</button>
      </form>

      <div class="notice" id="merchant-notice"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['links']): ?>
    <section class="card portal-section" data-section="links">
      <h2>Payment links</h2>
      <form id="link-form" class="row">
        <div class="field"><label>Amount (MUR, blank = payer chooses)</label><input type="text" name="amount" placeholder="optional"></div>
        <div class="field"><label>Description</label><input type="text" name="description" placeholder="e.g. Invoice #42"></div>
        <button class="btn-primary" type="submit">Create link</button>
      </form>
      <div class="notice" id="link-notice"></div>
      <div id="link-list"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['qr']): ?>
    <section class="card portal-section" data-section="qr">
      <h2>Merchant QR</h2>
      <form id="qr-form" class="row">
        <div class="field"><label>Type</label>
          <input type="text" name="qr_type" value="DYNAMIC" list="qrtypes">
          <datalist id="qrtypes"><option value="STATIC"><option value="DYNAMIC"><option value="REQUEST"></datalist>
        </div>
        <div class="field"><label>Amount (MUR, required unless STATIC)</label><input type="text" name="amount" placeholder="e.g. 250.00"></div>
        <button class="btn-primary" type="submit">Create QR</button>
      </form>
      <div class="notice" id="qr-notice"></div>
      <div id="qr-list"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['pay']): ?>
    <section class="card portal-section" data-section="pay">
      <h2>Pay by Bank</h2>
      <form id="pay-form" class="stack">
        <div class="row">
          <div class="field"><label>Merchant reference</label><input type="text" name="merchant_reference" placeholder="MER_…" required></div>
          <div class="field"><label>Amount (MUR)</label><input type="text" name="amount" placeholder="1500.50" required></div>
          <div class="field">
            <label>Method</label>
            <input type="text" name="payment_type" value="BANK_TRANSFER" list="ptypes">
            <datalist id="ptypes">
              <option value="BANK_TRANSFER"><option value="QR"><option value="PAYMENT_LINK"><option value="VIRTUAL_CREDENTIAL">
            </datalist>
          </div>
        </div>
        <button class="btn-primary" type="submit">Initiate payment</button>
      </form>
      <div class="notice" id="pay-notice"></div>
      <div id="pay-result"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['credentials']): ?>
    <section class="card portal-section" data-section="credentials">
      <h2>Virtual payment credentials</h2>
      <p class="muted">Aliases and virtual credentials (opaque identifiers — never a real card; no PAN stored).</p>
      <form id="alias-form" class="row">
        <div class="field"><label>Alias</label><input type="text" name="alias" placeholder="@yourhandle"></div>
        <div class="field"><label>Type</label>
          <input type="text" name="alias_type" value="HANDLE" list="aliastypes">
          <datalist id="aliastypes"><option value="HANDLE"><option value="PHONE"><option value="EMAIL"><option value="VPA"></datalist>
        </div>
        <button class="btn-secondary" type="submit">Add alias</button>
      </form>
      <form id="cred-form" class="row" style="margin-top:8px">
        <div class="field"><label>Credential type</label>
          <input type="text" name="type" value="BANK_ROUTING" list="credtypes">
          <datalist id="credtypes"><option value="BANK_ROUTING"><option value="PAYMENT_ALIAS"><option value="QR_PROFILE"><option value="CARD_TOKEN"><option value="WALLET"></datalist>
        </div>
        <button class="btn-secondary" type="submit">Issue credential</button>
      </form>
      <div class="notice" id="cred-notice"></div>
      <div id="cred-overview"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['compliance']): ?>
    <section class="card portal-section" data-section="compliance">
      <h2>Compliance review <span class="muted">(PassPass)</span></h2>
      <p class="muted">Merchants awaiting KYC decision. Approving clears them to transact.</p>
      <div id="compliance-queue">Loading…</div>
      <div class="notice" id="compliance-notice"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['finance']): ?>
    <section class="card portal-section" data-section="finance">
      <h2>Settlements <span class="muted">(supervised by PassPass)</span></h2>
      <form id="settle-form" class="row">
        <div class="field"><label>Merchant reference</label><input type="text" name="merchant_reference" placeholder="MER_…" required></div>
        <button class="btn-primary" type="submit">Settle PAID transactions</button>
      </form>
      <p class="muted" style="margin-top:8px">Sandbox helper — confirm a provider payment:</p>
      <form id="simulate-form" class="row">
        <div class="field"><label>Transaction reference</label><input type="text" name="reference" placeholder="TXN_…" required></div>
        <button class="btn-secondary" type="submit">Simulate PAID</button>
      </form>
      <div class="notice" id="finance-notice"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['reconciliation']): ?>
    <section class="card portal-section" data-section="reconciliation">
      <h2>Reconciliation</h2>
      <p class="muted">Three-way match (transaction ↔ settlement ↔ bank file). Without a bank file it reconciles against settlements; matched items advance to RECONCILED.</p>
      <form id="recon-form" class="row">
        <div class="field"><label>Merchant reference (optional)</label><input type="text" name="merchant_reference" placeholder="all merchants"></div>
        <button class="btn-primary" type="submit">Run reconciliation</button>
      </form>
      <div class="notice" id="recon-notice"></div>
      <div id="recon-result"></div>
    </section>
    <?php endif; ?>

    <?php if ($sections['routing']): ?>
    <section class="card portal-section" data-section="routing">
      <h2>Payment routing</h2>
      <div id="routing-table">Loading…</div>
    </section>
    <?php endif; ?>

  </main>

  <script src="/assets/js/portal.js"></script>
</body>
</html>
