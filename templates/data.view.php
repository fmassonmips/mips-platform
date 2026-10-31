<?php
/**
 * « Vos données » (owner): export, closing the account.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 * @var ?string $closing deletion date when the closing is requested
 * @var string $csrf_token
 * @var string $page_title
 */
use App\Format;
use App\Suite\Closure;

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <title><?= $e($page_title) ?> &middot; <?= $e($org['name']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <header class="app-header">
    <h1><a class="app-home" href="/dashboard.php">MIPS</a> <span class="app-crumb">/ Vos données</span></h1>
    <div class="user-info">
      <span><?= $e($org['name']) ?></span>
      <button id="logout-btn" type="button" class="btn-secondary">Déconnexion</button>
    </div>
  </header>

  <main class="app-main">
    <p id="data-error" class="error" role="alert" hidden></p>

    <?php if ($closing !== null): ?>
      <section class="card bk-warning">
        <h2>Fermeture du compte demandée</h2>
        <p>Les apps et vos pages publiques sont fermées, les autres membres n'ont plus accès.
          <strong>Toutes les données seront supprimées le <?= $e(Format::dateTime($closing)) ?>.</strong>
          D'ici là, vous pouvez les télécharger ou annuler la fermeture : tout redevient comme avant.</p>
        <div class="actions"><button type="button" class="btn-primary btn-inline" id="closure-cancel">Annuler la fermeture</button></div>
      </section>
    <?php endif; ?>

    <section class="card">
      <h2>Télécharger toutes vos données</h2>
      <p>Un fichier ZIP avec un tableau (CSV, à ouvrir avec Excel) par type de données : clients, factures et leurs lignes, fidélité,
        rendez-vous, formulaires, tickets, projets, commandes, congés, réservations… ainsi que les photos des produits et des logements.
        Les mots de passe et les identifiants MRA n'y figurent pas.</p>
      <p class="small muted">Conservez vos factures : la loi vous oblige à garder vos pièces comptables, même si vous quittez MIPS.</p>
      <div class="actions"><a class="btn-primary btn-inline" href="/export.php" id="export-link">Télécharger (ZIP)</a></div>
    </section>

    <?php if ($closing === null): ?>
      <section class="card">
        <h2>Fermer le compte de l'entreprise</h2>
        <p>Les apps et les pages publiques (réservation, boutique, formulaires) ferment tout de suite et les membres de l'équipe perdent l'accès.
          Seul le propriétaire peut encore se connecter, pour télécharger les données ou annuler.
          <strong>Après <?= Closure::DELAY_DAYS ?> jours, toutes les données de l'entreprise et les comptes de l'équipe sont supprimés définitivement</strong> :
          rien ne pourra être récupéré.</p>
        <p class="small muted">Téléchargez vos données avant. Les factures déjà transmises à la MRA restent enregistrées chez la MRA.</p>
        <form id="closure-form" novalidate>
          <div class="form-grid">
            <div class="field"><label for="cl-name">Tapez le nom de l'entreprise : <?= $e($org['name']) ?></label><input type="text" id="cl-name" name="name" autocomplete="off" required></div>
            <div class="field"><label for="cl-password">Votre mot de passe</label><input type="password" id="cl-password" name="password" autocomplete="current-password" required></div>
          </div>
          <div class="actions"><button type="submit" class="btn-secondary danger">Fermer le compte</button></div>
        </form>
      </section>
    <?php endif; ?>
  </main>
  <script src="/assets/js/dashboard.js"></script>
  <script src="/assets/js/data.js"></script>
</body>
</html>
