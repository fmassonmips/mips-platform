<?php
/** @var array<string,mixed> $user */
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
<body>
  <header class="app-header">
    <h1>MIPS Dashboard</h1>
    <div class="user-info">
      <span>
        Signed in as
        <strong><?= htmlspecialchars((string) $user['email'], ENT_QUOTES, 'UTF-8') ?></strong>
      </span>
      <button id="logout-btn" type="button" class="btn-secondary">Logout</button>
    </div>
  </header>

  <main class="app-main">
    <section class="card">
      <h2>
        Welcome,
        <?= htmlspecialchars((string) ($user['name'] ?? $user['email']), ENT_QUOTES, 'UTF-8') ?>!
      </h2>
      <p>
        This dashboard is protected. You are seeing it because you are authenticated.
        Any unauthenticated visitor is redirected to the login page by
        <code>Auth::require_auth()</code>.
      </p>
      <dl class="meta">
        <dt>User ID</dt><dd><?= (int) $user['id'] ?></dd>
        <dt>Role</dt><dd><?= htmlspecialchars((string) ($user['role'] ?? 'user'), ENT_QUOTES, 'UTF-8') ?></dd>
        <dt>Member since</dt><dd><?= htmlspecialchars((string) ($user['created_at'] ?? '-'), ENT_QUOTES, 'UTF-8') ?></dd>
      </dl>
    </section>
  </main>

  <script src="/assets/js/dashboard.js"></script>
</body>
</html>
