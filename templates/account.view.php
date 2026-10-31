<?php
/**
 * Account pages outside the app: confirm the e-mail, forgot password, new password.
 *
 * @var string $mode verify | forgot | reset | expired
 * @var string $token
 * @var string $csrf_token
 * @var string $page_title
 */
$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
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
    <h1 id="auth-title"><?= $e($page_title) ?></h1>
    <?php if ($mode === 'verify'): ?>
      <p class="auth-subtitle">Pour activer votre compte MIPS, saisissez le mot de passe choisi à l’inscription.</p>
      <form id="account-form" data-action="verify" data-t="<?= $e($token) ?>" novalidate>
        <div class="field"><label for="password">Mot de passe</label><input type="password" id="password" name="password" autocomplete="current-password" required></div>
        <button type="submit" id="submit-btn" class="btn-primary">Confirmer mon adresse</button>
        <p id="error-message" class="error" role="alert" hidden></p>
      </form>
    <?php elseif ($mode === 'forgot'): ?>
      <p class="auth-subtitle">Indiquez l’adresse de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
      <form id="account-form" data-action="forgot" novalidate>
        <div class="field"><label for="email">E-mail</label><input type="email" id="email" name="email" autocomplete="email" required></div>
        <button type="submit" id="submit-btn" class="btn-primary">Envoyer le lien</button>
        <p id="error-message" class="error" role="alert" hidden></p>
        <p id="done-message" class="success" role="status" hidden></p>
      </form>
    <?php elseif ($mode === 'reset'): ?>
      <form id="account-form" data-action="reset" data-t="<?= $e($token) ?>" novalidate>
        <div class="field"><label for="password">Nouveau mot de passe</label><input type="password" id="password" name="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label for="password2">Confirmer</label><input type="password" id="password2" name="password2" autocomplete="new-password" minlength="8" required></div>
        <button type="submit" id="submit-btn" class="btn-primary">Enregistrer et me connecter</button>
        <p class="small muted">Vos autres sessions ouvertes seront déconnectées.</p>
        <p id="error-message" class="error" role="alert" hidden></p>
      </form>
    <?php else: ?>
      <p>Ce lien n’est plus valable : il a déjà servi, a expiré (1 heure) ou a été remplacé par un plus récent.</p>
      <p><a href="/forgot.php">Demander un nouveau lien</a></p>
    <?php endif; ?>
    <p class="auth-link"><a href="/login.php">Se connecter</a></p>

    <p class="legal-links"><a href="/cgu.php">Conditions d’utilisation</a> · <a href="/confidentialite.php">Confidentialité</a></p>
  </main>
  <script src="/assets/js/account.js"></script>
</body>
</html>
