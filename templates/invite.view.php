<?php
/**
 * @var string $token
 * @var array<string,mixed>|null $invitation
 * @var array<string,mixed>|null $current
 * @var string $csrf_token
 * @var string $page_title
 */
use App\Suite\Team;

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$i = $invitation;
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <meta name="referrer" content="no-referrer">
  <title><?= $e($page_title) ?> &middot; MIPS</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card" aria-labelledby="auth-title">
    <?php if ($i === null): ?>
      <h1 id="auth-title">Invitation non valable</h1>
      <p>Ce lien a expiré, a déjà servi ou a été remplacé par une nouvelle invitation. Demandez à votre collègue de vous en renvoyer une.</p>
      <p class="auth-link"><a href="/login.php">Se connecter</a></p>
    <?php else: ?>
      <h1 id="auth-title">Rejoindre <?= $e($i['organization_name']) ?></h1>
      <p class="auth-subtitle"><?= $i['invited_by_name'] !== null ? $e($i['invited_by_name']) . ' vous invite' : 'Vous êtes invité(e)' ?> en tant que <?= $e(mb_strtolower(Team::ROLES[$i['role']] ?? $i['role'])) ?>.</p>
      <?php if ($current !== null && mb_strtolower((string) $current['email']) !== mb_strtolower((string) $i['email'])): ?>
        <p class="small muted">Vous êtes connecté(e) en tant que <?= $e($current['email']) ?> : accepter vous connectera avec le nouveau compte.</p>
      <?php endif; ?>
      <form id="invite-accept" novalidate data-t="<?= $e($token) ?>">
        <div class="field"><label for="email">E-mail</label><input type="email" id="email" value="<?= $e($i['email']) ?>" readonly></div>
        <div class="field"><label for="name">Votre nom</label><input type="text" id="name" name="name" autocomplete="name" maxlength="120" required></div>
        <?php if ((int) $i['has_account'] > 0): ?>
          <div class="field"><label for="password">Mot de passe de votre compte MIPS</label>
            <input type="password" id="password" name="password" autocomplete="current-password" required></div>
          <p class="small muted">Cette adresse a déjà un compte MIPS : son mot de passe est demandé.</p>
        <?php else: ?>
          <div class="field"><label for="password">Choisissez un mot de passe</label>
            <input type="password" id="password" name="password" autocomplete="new-password" minlength="8" required></div>
        <?php endif; ?>
        <button type="submit" id="submit-btn" class="btn-primary">Rejoindre l'équipe</button>
        <p id="error-message" class="error" role="alert" hidden></p>
      </form>
    <?php endif; ?>
  </main>
  <script src="/assets/js/invite.js"></script>
</body>
</html>
