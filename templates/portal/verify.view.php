<?php require __DIR__ . '/partials/auth_head.php'; ?>
    <h1 id="auth-title">Confirm your email address</h1>
    <form id="verify-form" data-token="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>" novalidate>
      <p class="auth-subtitle">Click the button to activate your MIPS merchant portal account.</p>
      <button type="submit" id="submit-btn" class="btn-primary">Confirm my email address</button>
      <p id="error-message" class="error" role="alert" hidden></p>
    </form>
    <p class="auth-link"><a href="/portal/login.php">Sign in</a></p>
  </main>
  <script src="/assets/js/portal-auth.js"></script>
</body>
</html>
