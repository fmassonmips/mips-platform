<?php
/** @var array<string,mixed> $user */
/** @var array{id:int,name:string,role:string} $org */
/** @var array<string,array{name:string,domain:string,tagline:string,status:string}> $catalog */
/** @var array<string,array{status:string,activated_at:string,trial_ends_at:?string}> $enabled */
/** @var list<string> $trial_ended */
/** @var bool $can_manage */
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
      <dl class="meta">
        <dt>Organization</dt><dd><?= htmlspecialchars($org['name'], ENT_QUOTES, 'UTF-8') ?></dd>
        <dt>Your role</dt><dd><?= htmlspecialchars($org['role'], ENT_QUOTES, 'UTF-8') ?></dd>
      </dl>
    </section>

    <section class="suite" aria-labelledby="suite-title">
      <h2 id="suite-title">Apps</h2>
      <p id="suite-error" class="error" role="alert" hidden></p>
      <ul class="app-grid">
        <?php foreach ($catalog as $slug => $m): ?>
          <?php $isOn = isset($enabled[$slug]); ?>
          <li class="app-tile<?= $isOn ? ' is-enabled' : '' ?>">
            <span class="app-icon app-icon--<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>" aria-hidden="true">
              <?= htmlspecialchars(mb_substr($m['name'], 0, 1), ENT_QUOTES, 'UTF-8') ?>
            </span>
            <span class="app-name"><?= htmlspecialchars($m['name'], ENT_QUOTES, 'UTF-8') ?></span>
            <span class="app-tagline"><?= htmlspecialchars($m['tagline'], ENT_QUOTES, 'UTF-8') ?></span>

            <?php if ($isOn): ?>
              <?php if ($enabled[$slug]['status'] === 'trial' && $enabled[$slug]['trial_ends_at'] !== null): ?>
                <span class="app-badge">Trial until <?= htmlspecialchars(substr($enabled[$slug]['trial_ends_at'], 0, 10), ENT_QUOTES, 'UTF-8') ?></span>
              <?php endif; ?>
              <a class="btn-secondary" href="/app.php?m=<?= rawurlencode($slug) ?>">Open</a>
              <?php if ($can_manage): ?>
                <button type="button" class="btn-link" data-action="deactivate" data-module="<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>">Deactivate</button>
              <?php endif; ?>
            <?php elseif ($m['status'] !== 'available'): ?>
              <span class="app-badge">Coming soon</span>
            <?php elseif (in_array($slug, $trial_ended, true)): ?>
              <span class="app-badge">Free trial ended</span>
            <?php elseif ($can_manage): ?>
              <button type="button" class="btn-secondary" data-action="activate" data-module="<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>">Start free trial</button>
            <?php else: ?>
              <span class="app-badge">Ask an admin to enable it</span>
            <?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ul>
    </section>
  </main>

  <script src="/assets/js/dashboard.js"></script>
</body>
</html>
