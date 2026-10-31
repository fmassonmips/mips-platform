<?php
/** @var array<string,mixed> $user */
/** @var array{id:int,name:string,role:string} $org */
/** @var array{name:string,domain:string,tagline:string,status:string} $module */
/** @var string $slug */
/** @var string $module_view */
/** @var string $csrf_token */
/** @var string $page_title */
/** @var string|null $read_only trial end when the app is read-only */
/** @var string $subscribe */
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8') ?>">
  <title><?= htmlspecialchars($page_title, ENT_QUOTES, 'UTF-8') ?> &middot; Tableau de bord MIPS</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body<?= $read_only !== null ? ' class="is-readonly"' : '' ?>>
  <header class="app-header">
    <h1>
      <a class="app-home" href="/dashboard.php">MIPS</a>
      <span class="app-crumb">/ <?= htmlspecialchars($module['name'], ENT_QUOTES, 'UTF-8') ?></span>
    </h1>
    <div class="user-info">
      <span><?= htmlspecialchars($org['name'], ENT_QUOTES, 'UTF-8') ?></span>
      <button id="logout-btn" type="button" class="btn-secondary">Déconnexion</button>
    </div>
  </header>

  <main class="app-main">
    <?php if ($read_only !== null): ?>
      <section class="card ro-banner" role="status">
        <p><strong>Essai gratuit terminé le <?= htmlspecialchars(\App\Format::date($read_only), ENT_QUOTES, 'UTF-8') ?> : <?= htmlspecialchars($module['name'], ENT_QUOTES, 'UTF-8') ?> est en lecture seule.</strong>
          Vos données restent consultables, imprimables et exportables ; la saisie et les pages publiques (réservation, boutique, formulaires) sont arrêtées.
          <?php if ($subscribe !== ''): ?><a href="mailto:<?= htmlspecialchars($subscribe, ENT_QUOTES, 'UTF-8') ?>?subject=<?= rawurlencode('Abonnement ' . $module['name'] . ' – ' . $org['name']) ?>">Passer à l’abonnement</a><?php else: ?>Contactez MIPS pour passer à l’abonnement.<?php endif; ?></p>
      </section>
    <?php endif; ?>
    <?php require $module_view; ?>
  </main>

  <script src="/assets/js/dashboard.js"></script>
  <?php if (is_file(ROOT_PATH . '/public/assets/js/' . $slug . '.js')): ?>
    <script src="/assets/js/<?= rawurlencode($slug) ?>.js"></script>
  <?php endif; ?>
</body>
</html>
