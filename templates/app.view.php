<?php
/** @var array<string,mixed> $user */
/** @var array{id:int,name:string,role:string} $org */
/** @var array{name:string,domain:string,tagline:string,status:string} $module */
/** @var string $slug */
/** @var string $module_view */
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
    <h1>
      <a class="app-home" href="/dashboard.php">MIPS</a>
      <span class="app-crumb">/ <?= htmlspecialchars($module['name'], ENT_QUOTES, 'UTF-8') ?></span>
    </h1>
    <div class="user-info">
      <span><?= htmlspecialchars($org['name'], ENT_QUOTES, 'UTF-8') ?></span>
      <button id="logout-btn" type="button" class="btn-secondary">Logout</button>
    </div>
  </header>

  <main class="app-main">
    <?php require $module_view; ?>
  </main>

  <script src="/assets/js/dashboard.js"></script>
  <?php if (is_file(ROOT_PATH . '/public/assets/js/' . $slug . '.js')): ?>
    <script src="/assets/js/<?= rawurlencode($slug) ?>.js"></script>
  <?php endif; ?>
</body>
</html>
