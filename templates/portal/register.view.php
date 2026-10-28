<?php require __DIR__ . '/partials/auth_head.php'; ?>
    <h1 id="auth-title">Create an account</h1>
    <p class="auth-subtitle">One account per business application. We will send you a link to confirm your email address.</p>

    <form id="register-form" novalidate>
      <div class="field">
        <label for="name">Your name</label>
        <input type="text" id="name" autocomplete="name" required maxlength="120">
      </div>
      <div class="field">
        <label for="email">Work email</label>
        <input type="email" id="email" autocomplete="email" required spellcheck="false" autocapitalize="off">
      </div>
      <div class="field">
        <label for="phone">Phone <span class="muted">(optional)</span></label>
        <input type="tel" id="phone" autocomplete="tel" maxlength="40">
      </div>
      <div class="field">
        <label for="password">Password <span class="muted">(at least 8 characters)</span></label>
        <input type="password" id="password" autocomplete="new-password" required minlength="8">
      </div>
      <div class="field">
        <label for="password2">Confirm password</label>
        <input type="password" id="password2" autocomplete="new-password" required minlength="8">
      </div>
      <button type="submit" id="submit-btn" class="btn-primary">Create account</button>
      <p id="error-message" class="error" role="alert" hidden></p>
    </form>
    <p id="done-message" class="success" role="status" hidden></p>

    <p class="auth-link">Already registered? <a href="/portal/login.php">Sign in</a></p>
  </main>
  <script src="/assets/js/portal-auth.js"></script>
</body>
</html>
