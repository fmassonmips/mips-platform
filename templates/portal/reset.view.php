<?php require __DIR__ . '/partials/auth_head.php'; ?>
    <h1 id="auth-title">Choose a new password</h1>
    <?php if (!$token_valid): ?>
      <p class="error" role="alert">This link is invalid, expired or already used.</p>
      <p class="auth-link"><a href="/portal/forgot.php">Ask for a new link</a></p>
    <?php else: ?>
      <form id="reset-form" data-token="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>" novalidate>
        <div class="field">
          <label for="password">New password <span class="muted">(at least 8 characters)</span></label>
          <input type="password" id="password" autocomplete="new-password" required minlength="8">
        </div>
        <div class="field">
          <label for="password2">Confirm new password</label>
          <input type="password" id="password2" autocomplete="new-password" required minlength="8">
        </div>
        <button type="submit" id="submit-btn" class="btn-primary">Change password</button>
        <p id="error-message" class="error" role="alert" hidden></p>
      </form>
    <?php endif; ?>
  </main>
  <script src="/assets/js/portal-auth.js"></script>
</body>
</html>
