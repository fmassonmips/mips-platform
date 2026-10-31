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
    <h1 id="auth-title">Create account</h1>
    <p class="auth-subtitle">Register for the MIPS dashboard.</p>

    <form id="register-form" novalidate autocomplete="on">
      <div class="field">
        <label for="name">Name</label>
        <input
          type="text"
          id="name"
          name="name"
          autocomplete="name"
          required
          maxlength="120"
          spellcheck="false">
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          autocomplete="email"
          required
          spellcheck="false"
          autocapitalize="off">
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          autocomplete="new-password"
          required
          minlength="8">
      </div>

      <button type="submit" id="submit-btn" class="btn-primary">Create account</button>

      <p id="error-message" class="error" role="alert" hidden></p>
    </form>

    <p class="auth-link">Already have an account? <a href="/login.php">Sign in</a></p>
  </main>
  <script src="/assets/js/register.js"></script>
</body>
</html>
