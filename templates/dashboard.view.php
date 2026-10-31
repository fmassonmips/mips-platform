<?php
/** @var array<string,mixed> $user */
/** @var array{id:int,name:string,role:string} $org */
/** @var array<string,array{name:string,domain:string,tagline:string,status:string}> $catalog */
/** @var array<string,array{status:string,activated_at:string,trial_ends_at:?string}> $enabled */
/** @var list<string> $trial_ended */
/** @var bool $can_manage */
/** @var int $team_size */
/** @var string $csrf_token */
/** @var string $page_title */
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
<body>
  <header class="app-header">
    <h1>Tableau de bord MIPS</h1>
    <div class="user-info">
      <span>
        Connecté en tant que
        <strong><?= htmlspecialchars((string) $user['email'], ENT_QUOTES, 'UTF-8') ?></strong>
      </span>
      <button id="logout-btn" type="button" class="btn-secondary">Déconnexion</button>
    </div>
  </header>

  <main class="app-main">
    <section class="card">
      <h2>
        Bienvenue,
        <?= htmlspecialchars((string) ($user['name'] ?? $user['email']), ENT_QUOTES, 'UTF-8') ?>&nbsp;!
      </h2>
      <dl class="meta">
        <dt>Entreprise</dt><dd><?= htmlspecialchars($org['name'], ENT_QUOTES, 'UTF-8') ?></dd>
        <dt>Votre rôle</dt><dd><?= htmlspecialchars(['owner' => 'propriétaire', 'admin' => 'administrateur', 'member' => 'membre'][$org['role']] ?? $org['role'], ENT_QUOTES, 'UTF-8') ?></dd>
        <dt>Équipe</dt><dd><?= $team_size ?> personne<?= $team_size > 1 ? 's' : '' ?> · <a href="/team.php"><?= $can_manage ? 'Gérer l’équipe' : 'Voir l’équipe' ?></a></dd>
      </dl>
    </section>

    <section class="suite" aria-labelledby="suite-title">
      <h2 id="suite-title">Applications</h2>
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
                <span class="app-badge">Essai jusqu’au <?= htmlspecialchars(\App\Format::date($enabled[$slug]['trial_ends_at']), ENT_QUOTES, 'UTF-8') ?></span>
              <?php endif; ?>
              <a class="btn-secondary" href="/app.php?m=<?= rawurlencode($slug) ?>">Ouvrir</a>
              <?php if ($can_manage): ?>
                <button type="button" class="btn-link" data-action="deactivate" data-module="<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>">Désactiver</button>
              <?php endif; ?>
            <?php elseif ($m['status'] !== 'available'): ?>
              <span class="app-badge">Bientôt disponible</span>
            <?php elseif (in_array($slug, $trial_ended, true)): ?>
              <span class="app-badge">Essai gratuit terminé</span>
            <?php elseif ($can_manage): ?>
              <button type="button" class="btn-secondary" data-action="activate" data-module="<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>">Démarrer l’essai gratuit</button>
            <?php else: ?>
              <span class="app-badge">Demandez à un administrateur de l’activer</span>
            <?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ul>
    </section>
  </main>

  <script src="/assets/js/dashboard.js"></script>
</body>
</html>
