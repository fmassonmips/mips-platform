<?php
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
<body class="auth-body">
  <main class="auth-card" aria-labelledby="auth-title">
    <h1 id="auth-title">Créer un compte</h1>
    <p class="auth-subtitle">Inscrivez-vous au tableau de bord MIPS.</p>

    <form id="register-form" novalidate autocomplete="on">
      <div class="field">
        <label for="name">Nom</label>
        <input
          type="text"
          id="name"
          name="name"
          autocomplete="name"
          required
          maxlength="120"
          spellcheck="false">
      </div>

      <div class="field">
        <label for="email">E-mail</label>
        <input
          type="email"
          id="email"
          name="email"
          autocomplete="email"
          required
          spellcheck="false"
          autocapitalize="off">
      </div>

      <div class="field">
        <label for="password">Mot de passe</label>
        <input
          type="password"
          id="password"
          name="password"
          autocomplete="new-password"
          required
          minlength="8">
      </div>

      <button type="submit" id="submit-btn" class="btn-primary">Créer un compte</button>

      <p id="error-message" class="error" role="alert" hidden></p>
    </form>

    <p id="done-message" class="success" role="status" hidden></p>

    <p class="auth-link">Déjà un compte ? <a href="/login.php">Se connecter</a></p>
  </main>
  <script src="/assets/js/register.js"></script>
</body>
</html>
