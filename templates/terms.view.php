<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'terms';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card">
      <h2>Merchant portal terms of use</h2>
      <p class="muted">The latest version is the one merchants must accept. A published version cannot be edited: publish a new version, and every merchant will be asked to accept it at their next visit. Each acceptance records the account, the date, the IP address and the fingerprint (sha256) of the exact text.</p>
      <p id="terms-error" class="error" role="alert" hidden></p>
      <div id="versions"></div>
    </section>

    <section class="card">
      <h2>Publish a new version</h2>
      <p class="notice">The text must come from MIPS legal / compliance. It is shown to merchants exactly as typed (plain text).</p>
      <form id="publish-form" class="grid-form" novalidate>
        <div class="field"><label for="t-version">Version</label><input type="text" id="t-version" name="version" maxlength="20" placeholder="e.g. 2026.1" required></div>
        <div class="field field-wide"><label for="t-title">Title</label><input type="text" id="t-title" name="title" maxlength="200" required></div>
        <div class="field field-wide"><label for="t-body">Text</label><textarea id="t-body" name="body" rows="14" required></textarea></div>
        <div class="field field-submit"><button type="submit" class="btn-primary btn-auto">Publish</button></div>
      </form>
      <p id="publish-error" class="error" role="alert" hidden></p>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/terms.js"></script>
</body>
</html>
