<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'merchants';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card" id="alerts-card" hidden>
      <h2>Contracts to act on</h2>
      <p class="muted" id="alerts-intro"></p>
      <div id="alerts"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Merchants</h2>
        <form id="filters" class="toolbar" novalidate>
          <label for="f-status" class="sr-only">Status</label>
          <select id="f-status" name="status"><option value="">All statuses</option></select>
          <label for="f-q" class="sr-only">Search</label>
          <input type="text" id="f-q" name="q" placeholder="Name, legal name, BRN, MID…">
          <button type="submit" class="btn-secondary">Search</button>
          <button type="button" id="new-btn" class="btn-primary btn-auto">New merchant</button>
        </form>
      </div>
      <p id="counts" class="muted"></p>
      <p id="list-error" class="error" role="alert" hidden></p>

      <form id="new-form" class="grid-form panel" novalidate hidden>
        <div class="field">
          <label for="n-name">Name <span class="muted">(as in Commission_Data form_name)</span></label>
          <input type="text" id="n-name" name="name" required>
        </div>
        <div class="field">
          <label for="n-legal">Legal name</label>
          <input type="text" id="n-legal" name="legal_name">
        </div>
        <div class="field">
          <label for="n-status">Status</label>
          <select id="n-status" name="status"></select>
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Create</button>
        </div>
      </form>

      <div id="merchants"></div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/merchants.js"></script>
</body>
</html>
