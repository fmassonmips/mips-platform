<?php
/** @var array<string,mixed> $user portal account */
/** @var string $csrf_token */
/** @var string $page_title */
/** @var string $active */
$nav = [
    'home'        => ['/portal/home.php', 'Progress'],
    'application' => ['/portal/application.php', 'Application'],
    'documents'   => ['/portal/documents.php', 'Documents'],
    'security'    => ['/portal/security.php', 'Security'],
];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">
  <title><?= htmlspecialchars($page_title, ENT_QUOTES, 'UTF-8') ?> &middot; MIPS merchant portal</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="portal" data-login="/portal/login.php" data-logout="/api/portal/logout">
  <header class="app-header">
    <div class="app-brand">
      <h1>MIPS merchant portal</h1>
      <nav class="app-nav" aria-label="Main">
        <?php foreach ($nav as $key => [$href, $label]): ?>
          <a href="<?= $href ?>"<?= $key === ($active ?? '') ? ' class="active" aria-current="page"' : '' ?>><?= $label ?></a>
        <?php endforeach; ?>
      </nav>
    </div>
    <div class="user-info">
      <span>Signed in as <strong><?= htmlspecialchars((string) $user['email'], ENT_QUOTES, 'UTF-8') ?></strong></span>
      <button id="logout-btn" type="button" class="btn-secondary">Logout</button>
    </div>
  </header>
