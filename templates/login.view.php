<?php
/** @var string $csrf_token */
/** @var string $page_title */

use App\I18n;

$t = static fn (string $k): string => htmlspecialchars(I18n::t($k), ENT_QUOTES, 'UTF-8');
$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$locale = I18n::locale();
?>
<!doctype html>
<html lang="<?= $e($locale) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <title><?= $t('auth.signin') ?> &middot; <?= $t('app.name') ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card" aria-labelledby="auth-title">
    <div class="auth-brand">
      <span class="brand-mark">MIPS</span>
      <span class="brand-text"><?= $t('app.tagline') ?></span>
    </div>
    <div class="lang-switch auth-lang" role="group" aria-label="<?= $t('nav.language') ?>">
      <?php foreach (I18n::available() as $code => $label): ?>
        <a href="<?= $e(I18n::switchUrl($code)) ?>"<?= $code === $locale ? ' class="active"' : '' ?>><?= $e(strtoupper($code)) ?></a>
      <?php endforeach; ?>
    </div>

    <h1 id="auth-title"><?= $t('auth.signin') ?></h1>
    <p class="auth-subtitle"><?= $t('auth.signin_subtitle') ?></p>

    <?php if (isset($_GET['registered']) && $_GET['registered'] === '1'): ?>
      <p class="success" role="status"><?= $t('auth.registered') ?></p>
    <?php endif; ?>

    <form id="login-form" novalidate autocomplete="on">
      <div class="field">
        <label for="email"><?= $t('auth.email') ?></label>
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
        <label for="password"><?= $t('auth.password') ?></label>
        <input
          type="password"
          id="password"
          name="password"
          autocomplete="current-password"
          required
          minlength="8">
      </div>

      <button type="submit" id="submit-btn" class="btn-primary"><?= $t('auth.signin_btn') ?></button>

      <p id="error-message" class="error" role="alert" hidden></p>
    </form>

    <p class="auth-link"><?= $t('auth.no_account') ?> <a href="/register.php"><?= $t('auth.create_one') ?></a></p>
  </main>
  <script src="/assets/js/login.js"></script>
</body>
</html>
