<?php
/** @var string $csrf_token */
/** @var string $page_title */
/** @var string $token */
/** @var bool $token_valid */
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">
  <title><?= htmlspecialchars($page_title, ENT_QUOTES, 'UTF-8') ?> &middot; MIPS Dashboard</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card" aria-labelledby="auth-title">
    <h1 id="auth-title">Choose a new password</h1>
    <?php if (!$token_valid): ?>
      <p class="error" role="alert">This link is invalid, expired or already used.</p>
      <p class="auth-link"><a href="/forgot-password.php">Ask for a new link</a></p>
    <?php else: ?>
      <p class="auth-subtitle">All your other sessions will be signed out.</p>
      <form id="reset-form" novalidate>
        <input type="hidden" id="token" value="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>">
        <div class="field">
          <label for="password">New password</label>
          <input type="password" id="password" autocomplete="new-password" required minlength="8">
        </div>
        <div class="field">
          <label for="password2">Confirm new password</label>
          <input type="password" id="password2" autocomplete="new-password" required minlength="8">
        </div>
        <button type="submit" id="submit-btn" class="btn-primary">Set password</button>
        <p id="error-message" class="error" role="alert" hidden></p>
      </form>
    <?php endif; ?>
  </main>
  <script src="/assets/js/password.js"></script>
</body>
</html>
