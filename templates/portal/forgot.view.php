<?php require __DIR__ . '/partials/auth_head.php'; ?>
    <h1 id="auth-title">Forgot your password?</h1>
    <p class="auth-subtitle">Enter your email address: we will send you a link to choose a new password.</p>
    <form id="forgot-form" novalidate>
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" autocomplete="username" required spellcheck="false" autocapitalize="off">
      </div>
      <button type="submit" id="submit-btn" class="btn-primary">Send the link</button>
      <p id="error-message" class="error" role="alert" hidden></p>
    </form>
    <p id="done-message" class="success" role="status" hidden></p>
    <p class="auth-link"><a href="/portal/login.php">Back to sign in</a></p>
  </main>
  <script src="/assets/js/portal-auth.js"></script>
</body>
</html>
