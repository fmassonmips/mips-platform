<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'recon';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide" id="run-page" data-id="<?= (int) ($_GET['id'] ?? 0) ?>">
    <p><a href="/recon.php">&larr; All reconciliations</a></p>
    <p id="page-error" class="error" role="alert" hidden></p>

    <section class="card">
      <div class="card-head">
        <h2 id="run-title">Reconciliation</h2>
        <div class="toolbar">
          <a id="x-summary" class="btn-secondary" href="#">Summary CSV</a>
          <a id="x-lines" class="btn-secondary" href="#">By merchant CSV</a>
          <a id="x-claims" class="btn-secondary" href="#">MCB claim CSV</a>
          <button id="recompute-btn" type="button" class="btn-secondary">Recompute</button>
        </div>
      </div>
      <p id="run-meta" class="muted"></p>
      <ul id="warnings" class="flags"></ul>
    </section>

    <section class="card">
      <h2>Summary by currency</h2>
      <p class="muted">Gap = MCB &minus; MIPS. Every gap is split into categories that add up to it exactly; "Unexplained" must be 0.</p>
      <div id="summary"></div>
      <h3>Gap as % of MIPS volume</h3>
      <div id="pct"></div>
      <p id="global-pct" class="muted"></p>
      <div id="watch-cum"></div>
      <div id="suggestions"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Gaps by merchant</h2>
        <div class="toolbar">
          <label for="f-cat" class="sr-only">Category</label>
          <select id="f-cat"><option value="">All lines with a gap</option></select>
          <label for="f-cur" class="sr-only">Currency</label>
          <select id="f-cur"><option value="">All currencies</option></select>
        </div>
      </div>
      <div id="lines"></div>
    </section>

    <section class="card" id="drill-card" hidden>
      <h2 id="drill-title">Daily detail</h2>
      <div class="two-col">
        <div><h3>Days with a gap</h3><div id="drill-days"></div></div>
        <div>
          <h3>Candidate transactions for the claim</h3>
          <p class="muted">All MIPS transactions of this MID on the days MCB is short. Which ones MCB is missing is not proven: check before claiming.</p>
          <div id="drill-claims"></div>
        </div>
      </div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/recon-run.js"></script>
</body>
</html>
