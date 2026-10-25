<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'dashboard';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main">
    <section class="card">
      <h2>
        Welcome,
        <?= htmlspecialchars((string) ($user['name'] ?? $user['email']), ENT_QUOTES, 'UTF-8') ?>!
      </h2>
      <dl class="meta">
        <dt>User ID</dt><dd><?= (int) $user['id'] ?></dd>
        <dt>Role</dt><dd><?= htmlspecialchars((string) ($user['role'] ?? 'user'), ENT_QUOTES, 'UTF-8') ?></dd>
        <dt>Member since</dt><dd><?= htmlspecialchars((string) ($user['created_at'] ?? '-'), ENT_QUOTES, 'UTF-8') ?></dd>
      </dl>
      <?php if (!\App\Auth::can($user, 'reporting') && !\App\Auth::can($user, 'billing')): ?>
        <p class="muted">Your role does not give access to any module yet. Ask an administrator.</p>
      <?php endif; ?>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
</body>
</html>
