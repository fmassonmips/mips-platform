<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'reports';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card">
      <h2>Import Commission_Data</h2>
      <p class="muted">Upload the monthly <code>Commission_Data_*.xlsx</code> export (or a CSV with the same columns).
        Each month in the file replaces that month's previous import.</p>
      <form id="import-form" class="inline-form" novalidate>
        <div class="field">
          <label for="import-file">File</label>
          <input type="file" id="import-file" name="file" accept=".xlsx,.csv" required>
        </div>
        <div class="field">
          <label for="import-period">Month <span class="muted">(only if the file has no date column)</span></label>
          <input type="text" id="import-period" name="period" placeholder="YYYY-MM" pattern="\d{4}-\d{2}">
        </div>
        <button type="submit" id="import-btn" class="btn-primary btn-auto">Import</button>
      </form>
      <p id="import-error" class="error" role="alert" hidden></p>
      <div id="import-result" hidden></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Monthly report</h2>
        <div class="toolbar">
          <label for="period-select" class="sr-only">Month</label>
          <select id="period-select"></select>
          <a id="export-link" class="btn-secondary" href="#">Export CSV</a>
        </div>
      </div>
      <p id="report-empty" class="muted" hidden>No data imported yet.</p>
      <p id="report-error" class="error" role="alert" hidden></p>
      <div id="report"></div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/reports.js"></script>
</body>
</html>
