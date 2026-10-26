<?php
/** @var string $csrf_token */
/** @var string $page_title */
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
    <h1 id="auth-title">Forgot password</h1>
    <p class="auth-subtitle">Enter your email. If an active account exists, we send a reset link.</p>

    <form id="forgot-form" novalidate>
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="username" required spellcheck="false" autocapitalize="off">
      </div>
      <button type="submit" id="submit-btn" class="btn-primary">Send reset link</button>
      <p id="error-message" class="error" role="alert" hidden></p>
      <p id="success-message" class="success" role="status" hidden></p>
    </form>

    <p class="auth-link"><a href="/login.php">Back to sign in</a></p>
  </main>
  <script src="/assets/js/password.js"></script>
</body>
</html>
