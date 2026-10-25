<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'audit';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card">
      <h2>Audit log</h2>
      <form id="audit-filters" class="grid-form" novalidate>
        <div class="field">
          <label for="f-action">Action starts with</label>
          <input type="text" id="f-action" name="action" placeholder="e.g. invoice.">
        </div>
        <div class="field">
          <label for="f-user">User email contains</label>
          <input type="text" id="f-user" name="user">
        </div>
        <div class="field">
          <label for="f-etype">Entity type</label>
          <input type="text" id="f-etype" name="entity_type" placeholder="invoice, import, user…">
        </div>
        <div class="field">
          <label for="f-eid">Entity ID</label>
          <input type="text" id="f-eid" name="entity_id">
        </div>
        <div class="field">
          <label for="f-from">From</label>
          <input type="date" id="f-from" name="from">
        </div>
        <div class="field">
          <label for="f-to">To</label>
          <input type="date" id="f-to" name="to">
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Filter</button>
        </div>
      </form>
      <p id="audit-error" class="error" role="alert" hidden></p>
      <div id="audit"></div>
      <div class="pager">
        <button id="prev-page" type="button" class="btn-secondary">&larr; Newer</button>
        <span id="page-info" class="muted"></span>
        <button id="next-page" type="button" class="btn-secondary">Older &rarr;</button>
      </div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/audit.js"></script>
</body>
</html>
