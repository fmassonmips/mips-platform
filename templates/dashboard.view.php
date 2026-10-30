<?php
/** @var array<string,mixed> $user */
/** @var array{id:int,name:string,role:string} $org */
/** @var array<string,array{name:string,domain:string,tagline:string,status:string}> $catalog */
/** @var array<string,array{status:string,activated_at:string,trial_ends_at:?string}> $enabled */
/** @var list<string> $trial_ended */
/** @var array<string,string> $read_only slug => trial end */
/** @var string $subscribe e-mail to subscribe, may be empty */
/** @var bool $can_manage */
/** @var int $team_size */
/** @var bool $is_staff MIPS team: link to the back-office */
/** @var list<array{label:string,done:bool,url:string,cta:string}>|null $checklist « Bien démarrer », null when hidden */
/** @var ?string $closing deletion date when the owner asked to close the account */
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
      <?php if ($is_staff): ?><a class="btn-secondary bo-link" href="/backoffice.php">Back-office</a><?php endif; ?>
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
        <?php if ($org['role'] === 'owner'): ?><dt>Données</dt><dd><a href="/data.php">Télécharger ou fermer le compte</a></dd><?php endif; ?>
      </dl>
    </section>

    <?php if ($closing !== null): ?>
      <section class="card bk-warning">
        <p><strong>Fermeture du compte demandée :</strong> les apps sont fermées et toutes les données seront supprimées le
          <?= htmlspecialchars(\App\Format::dateTime($closing), ENT_QUOTES, 'UTF-8') ?>.
          <a href="/data.php">Télécharger les données ou annuler</a></p>
      </section>
    <?php endif; ?>

    <?php if ($checklist !== null): $done = count(array_filter(array_column($checklist, 'done'))); ?>
      <section class="card ob-card" id="ob-card">
        <h2>Bien démarrer <span class="muted small"><?= $done ?> / <?= count($checklist) ?></span></h2>
        <ul class="ob-list">
          <?php foreach ($checklist as $s): ?>
            <li class="<?= $s['done'] ? 'ob-done' : '' ?>">
              <span class="ob-check" aria-hidden="true"><?= $s['done'] ? '✓' : '' ?></span>
              <span class="ob-text"><?= htmlspecialchars($s['label'], ENT_QUOTES, 'UTF-8') ?><?= $s['done'] ? ' <span class="sr-only">(fait)</span>' : '' ?></span>
              <?php if (!$s['done']): ?><a class="btn-link" href="<?= htmlspecialchars($s['url'], ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($s['cta'], ENT_QUOTES, 'UTF-8') ?></a><?php endif; ?>
            </li>
          <?php endforeach; ?>
        </ul>
        <p class="small muted"><button type="button" class="btn-link" id="ob-hide">Masquer cette liste</button></p>
      </section>
    <?php endif; ?>

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
            <?php elseif (isset($read_only[$slug])): ?>
              <span class="app-badge app-badge--ro">Essai terminé le <?= htmlspecialchars(\App\Format::date($read_only[$slug]), ENT_QUOTES, 'UTF-8') ?> · lecture seule</span>
              <a class="btn-secondary" href="/app.php?m=<?= rawurlencode($slug) ?>">Consulter</a>
              <?php if ($subscribe !== ''): ?><a class="btn-link" href="mailto:<?= htmlspecialchars($subscribe, ENT_QUOTES, 'UTF-8') ?>?subject=<?= rawurlencode('Abonnement ' . $m['name'] . ' – ' . $org['name']) ?>">Passer à l’abonnement</a><?php endif; ?>
              <?php if ($can_manage): ?>
                <button type="button" class="btn-link" data-action="deactivate" data-module="<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>">Désactiver</button>
              <?php endif; ?>
            <?php elseif ($m['status'] !== 'available'): ?>
              <span class="app-badge">Bientôt disponible</span>
            <?php elseif (in_array($slug, $trial_ended, true)): ?>
              <span class="app-badge">Essai gratuit terminé</span>
              <?php if ($can_manage): ?>
                <button type="button" class="btn-link" data-action="activate" data-module="<?= htmlspecialchars($slug, ENT_QUOTES, 'UTF-8') ?>">Réactiver en lecture seule</button>
              <?php endif; ?>
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
