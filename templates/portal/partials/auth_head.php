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
  <title><?= htmlspecialchars($page_title, ENT_QUOTES, 'UTF-8') ?> &middot; MIPS merchant portal</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body portal" data-login="/portal/login.php" data-logout="/api/portal/logout">
  <main class="auth-card" aria-labelledby="auth-title">
    <p class="portal-kicker">MIPS merchant portal</p>
