<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'onboarding';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide" id="app-page" data-id="<?= (int) ($_GET['id'] ?? 0) ?>">
    <p><a href="/onboarding.php">&larr; Onboarding</a></p>
    <p id="page-error" class="error error-pre" role="alert" hidden></p>

    <section class="card">
      <div class="card-head">
        <h2 id="app-title">Portal application</h2>
        <span id="app-status" class="badge"></span>
      </div>
      <p class="muted">Information declared by the applicant, not verified yet. Verification happens in the onboarding case (documents, screening).</p>
      <div id="flags"></div>
      <div id="details"></div>
    </section>

    <section class="card">
      <h2>Decision</h2>
      <div id="decision"></div>
    </section>

    <section class="card">
      <h2>Portal account</h2>
      <div id="account"></div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/application.js"></script>
</body>
</html>
