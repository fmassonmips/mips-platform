<?php require __DIR__ . '/partials/auth_head.php'; ?>
    <h1 id="auth-title">Sign in</h1>
    <p class="auth-subtitle">Follow your application to accept card, QR and online payments with MIPS.</p>
    <?php if (($_GET['reset'] ?? '') === '1'): ?>
      <p class="success" role="status">Password changed. Sign in with your new password.</p>
    <?php endif; ?>
    <?php if (($_GET['verified'] ?? '') === '1'): ?>
      <p class="success" role="status">Email address confirmed. You can sign in.</p>
    <?php endif; ?>

    <form id="login-form" novalidate>
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" autocomplete="username" required spellcheck="false" autocapitalize="off">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="current-password" required>
      </div>
      <button type="submit" id="submit-btn" class="btn-primary">Sign in</button>
      <p id="error-message" class="error" role="alert" hidden></p>
    </form>

    <form id="twofa-form" novalidate hidden>
      <p class="auth-subtitle">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      <div class="field">
        <label for="code">Verification code</label>
        <input type="text" id="code" autocomplete="one-time-code" inputmode="numeric" required spellcheck="false" autocapitalize="off">
      </div>
      <button type="submit" id="twofa-btn" class="btn-primary">Verify</button>
      <p id="twofa-error" class="error" role="alert" hidden></p>
    </form>

    <p class="auth-link"><a href="/portal/forgot.php">Forgot your password?</a></p>
    <p class="auth-link">New to MIPS? <a href="/portal/register.php">Create an account</a></p>
  </main>
  <script src="/assets/js/portal-auth.js"></script>
</body>
</html>
