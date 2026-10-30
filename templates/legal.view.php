<?php
/**
 * Public legal pages: terms of use, privacy policy.
 *
 * @var string $doc cgu | confidentialite
 * @var string $page_title
 */
use App\Format;
use App\Legal;

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$L = static fn (string $key): string => htmlspecialchars(Legal::get($key), ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e($page_title) ?> &middot; MIPS</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <header class="app-header">
    <h1><a class="app-home" href="/">MIPS</a> <span class="app-crumb">/ <?= $e($page_title) ?></span></h1>
    <div class="user-info"><a class="btn-secondary" href="/login.php">Se connecter</a></div>
  </header>

  <main class="app-main legal">
    <?php if (Legal::isDraft()): ?>
      <p class="legal-draft">Version provisoire, en cours de validation juridique : ce texte peut encore changer.</p>
    <?php endif; ?>
    <article class="card">
      <h1><?= $e($page_title) ?></h1>
      <p class="muted small">Version du <?= $e(Format::date(Legal::VERSION)) ?> ·
        <?= $doc === 'cgu' ? '<a href="/confidentialite.php">Politique de confidentialité</a>' : '<a href="/cgu.php">Conditions générales d’utilisation</a>' ?></p>
      <?php require __DIR__ . '/legal/' . ($doc === 'cgu' ? 'cgu' : 'confidentialite') . '.php'; ?>
    </article>
  </main>
</body>
</html>
