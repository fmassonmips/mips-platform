<?php
/**
 * Shared page chrome: <head>, top navigation bar, language selector and the
 * opening <main>. Every authenticated page includes this.
 *
 * Expects:
 * @var string               $page_title  short page title
 * @var string               $csrf_token  per-session CSRF token
 * @var array<string,mixed>  $user        the authenticated user
 * @var string               $active      active nav key (dashboard|clients|contracts|quotes)
 */
declare(strict_types=1);

use App\I18n;

$cfg    = $GLOBALS['config'];
$locale = I18n::locale();
$active  = $active ?? '';

// Data handed to the JS layer. Embedded as a non-executable JSON block so it
// stays compatible with the strict `script-src 'self'` CSP (no inline JS).
$pageData = [
    'csrf'     => $csrf_token,
    'locale'   => $locale,
    'currency' => (string) ($cfg['app']['currency_symbol'] ?? 'Rs'),
    't'        => I18n::messages(),
];

$nav = [
    'dashboard' => ['/dashboard.php', I18n::t('nav.dashboard')],
    'clients'   => ['/clients.php',   I18n::t('nav.clients')],
    'contracts' => ['/contracts.php', I18n::t('nav.contracts')],
    'quotes'    => ['/quotes.php',    I18n::t('nav.quotes')],
];

$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="<?= $e($locale) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <title><?= $e($page_title) ?> &middot; <?= $e(I18n::t('app.name')) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="app">
  <script type="application/json" id="page-data"><?= json_encode(
      $pageData,
      JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
  ) ?></script>

  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/dashboard.php">
        <span class="brand-mark">MIPS</span>
        <span class="brand-text"><?= $e(I18n::t('app.tagline')) ?></span>
      </a>

      <nav class="mainnav" aria-label="Primary">
        <?php foreach ($nav as $key => [$href, $label]): ?>
          <a href="<?= $e($href) ?>"<?= $active === $key ? ' class="active" aria-current="page"' : '' ?>><?= $e($label) ?></a>
        <?php endforeach; ?>
      </nav>

      <div class="topbar-right">
        <div class="lang-switch" role="group" aria-label="<?= $e(I18n::t('nav.language')) ?>">
          <?php foreach (I18n::available() as $code => $label): ?>
            <a href="<?= $e(I18n::switchUrl($code)) ?>"
               title="<?= $e($label) ?>"<?= $code === $locale ? ' class="active" aria-current="true"' : '' ?>><?= $e(strtoupper($code)) ?></a>
          <?php endforeach; ?>
        </div>
        <span class="user-email" title="<?= $e((string) $user['email']) ?>">
          <?= $e((string) ($user['name'] ?? $user['email'])) ?>
        </span>
        <button id="logout-btn" type="button" class="btn-secondary btn-sm"><?= $e(I18n::t('nav.logout')) ?></button>
      </div>
    </div>
  </header>

  <main class="app-main">
