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
    <h1 id="auth-title">Sign in</h1>
    <p class="auth-subtitle">Access the MIPS dashboard.</p>

    <?php if (isset($_GET['registered']) && $_GET['registered'] === '1'): ?>
      <p class="success" role="status">Account created successfully. An administrator will activate your account.</p>
    <?php endif; ?>

    <form id="login-form" novalidate autocomplete="on">
      <div class="field">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          autocomplete="username"
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
          autocomplete="current-password"
          required
          minlength="8">
      </div>

      <button type="submit" id="submit-btn" class="btn-primary">Sign in</button>

      <p id="error-message" class="error" role="alert" hidden></p>
    </form>

    <p class="auth-link">Don&rsquo;t have an account? <a href="/register.php">Create one</a></p>
  </main>
  <script src="/assets/js/login.js"></script>
</body>
</html>
