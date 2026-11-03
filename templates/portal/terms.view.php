<?php require __DIR__ . '/partials/header.php'; ?>

  <main class="app-main app-wide">
    <section class="card">
      <h2 id="terms-title">Terms of use</h2>
      <p id="terms-meta" class="muted"></p>
      <p id="terms-notice" class="notice" role="status" hidden></p>
      <p id="terms-error" class="error" role="alert" hidden></p>
      <div id="terms-text" class="terms-text" tabindex="0" aria-label="Text of the terms of use"></div>
      <form id="terms-form" novalidate hidden>
        <div class="field field-check">
          <label><input type="checkbox" id="terms-agree"> I have read and accept these terms of use on behalf of the business I represent.</label>
        </div>
        <button type="submit" class="btn-primary btn-auto">Accept and continue</button>
      </form>
      <p id="terms-done" class="success-left" role="status" hidden></p>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/portal-terms.js"></script>
</body>
</html>
