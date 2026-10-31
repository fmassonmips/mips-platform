<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'recon';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card">
      <h2>New reconciliation: MCB vs MIPS (e-commerce)</h2>
      <p class="muted">Upload the two files of the same month: MCB <code>PWC_ECOM_MMAAAA v2.xlsx</code> and the <strong>full</strong>
        MIPS extraction <code>PWC_ECOM_MMAAAA - MIPS - ALL BUNDLE.xlsx</code> (not the "no_qr" one filtered on order_is_bundled = 1).</p>
      <form id="run-form" class="grid-form" novalidate>
        <div class="field">
          <label for="r-period">Month</label>
          <input type="text" id="r-period" name="period" placeholder="YYYY-MM" required>
        </div>
        <div class="field">
          <label for="r-mcb">MCB file</label>
          <input type="file" id="r-mcb" name="mcb" accept=".xlsx,.csv" required>
        </div>
        <div class="field">
          <label for="r-mips">MIPS file</label>
          <input type="file" id="r-mips" name="mips" accept=".xlsx,.csv" required>
        </div>
        <div class="field field-submit">
          <button type="submit" id="run-btn" class="btn-primary btn-auto">Reconcile</button>
        </div>
      </form>
      <p id="run-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>Reconciliations</h2>
      <div id="runs"></div>
    </section>

    <section class="card">
      <h2>Settings</h2>
      <div class="two-col">
        <div>
          <h3>MID remaps <span class="muted">(same merchant, two MIDs)</span></h3>
          <div id="remaps"></div>
          <form id="remap-form" class="inline-form" novalidate>
            <div class="field"><label for="rm-from">From MID</label><input type="text" id="rm-from" name="from_mid" inputmode="numeric"></div>
            <div class="field"><label for="rm-to">Counted as</label><input type="text" id="rm-to" name="to_mid" inputmode="numeric"></div>
            <div class="field"><label for="rm-label">Merchant</label><input type="text" id="rm-label" name="label"></div>
            <button type="submit" class="btn-secondary">Add</button>
          </form>
        </div>
        <div>
          <h3>Watch-list MIDs <span class="muted">(absent from MCB, tracked cumulatively)</span></h3>
          <div id="watch"></div>
          <form id="watch-form" class="inline-form" novalidate>
            <div class="field"><label for="w-mid">MID</label><input type="text" id="w-mid" name="mid" inputmode="numeric"></div>
            <div class="field"><label for="w-label">Label</label><input type="text" id="w-label" name="label"></div>
            <button type="submit" class="btn-secondary">Add</button>
          </form>
        </div>
      </div>
      <p class="muted">After a change, open a reconciliation and click "Recompute".</p>
      <p id="settings-error" class="error" role="alert" hidden></p>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/recon.js"></script>
</body>
</html>
