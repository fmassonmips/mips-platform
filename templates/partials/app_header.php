<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
/** @var string $active */
$nav = [
    'dashboard' => ['/dashboard.php', 'Dashboard', null],
    'merchants' => ['/merchants.php', 'Merchants', 'merchants'],
    'reports'   => ['/reports.php',   'Reports',   'reporting'],
    'billing'   => ['/billing.php',   'Billing',   'billing'],
    'recon'     => ['/recon.php',     'Recon',     'recon'],
    'users'     => ['/users.php',     'Users',     'users'],
    'audit'     => ['/audit.php',     'Audit log', 'audit'],
];
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
    <div class="app-brand">
      <h1>MIPS Dashboard</h1>
      <nav class="app-nav" aria-label="Main">
        <?php foreach ($nav as $key => [$href, $label, $module]): ?>
          <?php if ($module === null || \App\Auth::can($user, $module)): ?>
            <a href="<?= $href ?>"<?= $key === ($active ?? '') ? ' class="active" aria-current="page"' : '' ?>><?= $label ?></a>
          <?php endif; ?>
        <?php endforeach; ?>
      </nav>
    </div>
    <div class="user-info">
      <span>
        Signed in as
        <strong><?= htmlspecialchars((string) $user['email'], ENT_QUOTES, 'UTF-8') ?></strong>
      </span>
      <a href="/account.php" class="btn-secondary<?= ($active ?? '') === 'account' ? ' active' : '' ?>">Account</a>
      <button id="logout-btn" type="button" class="btn-secondary">Logout</button>
    </div>
  </header>
