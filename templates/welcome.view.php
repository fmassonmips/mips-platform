<?php
/**
 * First steps wizard: company profile, apps, team.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 * @var int $step 1..3, step shown first
 * @var array<string,string> $profile
 * @var array<string,array{name:string,domain:string,tagline:string,status:string}> $catalog
 * @var array<string,array<string,mixed>> $enabled
 * @var list<string> $ended
 * @var bool $mail_on
 * @var string $csrf_token
 * @var string $page_title
 */
$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$isOwner = $org['role'] === 'owner';
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <title><?= $e($page_title) ?> &middot; MIPS</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <header class="app-header">
    <h1><a class="app-home" href="/dashboard.php">MIPS</a> <span class="app-crumb">/ Bien démarrer</span></h1>
    <div class="user-info">
      <a class="btn-secondary" href="/dashboard.php">Plus tard</a>
    </div>
  </header>

  <main class="app-main" id="wizard" data-step="<?= $step ?>">
    <section class="card">
      <div class="wz-progress" aria-hidden="true"><span></span><span></span><span></span></div>
      <p id="wz-error" class="error" role="alert" hidden></p>

      <form class="wz-step" data-step="1" id="wz-profile" novalidate hidden>
        <h2>1. Votre entreprise</h2>
        <p class="small muted">Ces informations sont imprimées sur vos devis, factures et confirmations. La raison sociale et le BRN sont obligatoires pour émettre une facture.</p>
        <div class="form-grid">
          <div class="field"><label for="wz-name">Nom commercial</label><input type="text" id="wz-name" name="name" maxlength="160" value="<?= $e($profile['name']) ?>" required></div>
          <div class="field"><label for="wz-legal">Raison sociale</label><input type="text" id="wz-legal" name="legal_name" maxlength="200" value="<?= $e($profile['legal_name']) ?>" placeholder="Ex. : Le Lagon Bleu Ltd"></div>
          <div class="field"><label for="wz-brn">BRN</label><input type="text" id="wz-brn" name="brn" maxlength="40" value="<?= $e($profile['brn']) ?>" placeholder="C07012345"></div>
          <div class="field"><label for="wz-vat">N° TVA (si assujetti)</label><input type="text" id="wz-vat" name="vat_number" maxlength="40" value="<?= $e($profile['vat_number']) ?>"></div>
          <div class="field"><label for="wz-phone">Téléphone</label><input type="text" id="wz-phone" name="phone" maxlength="40" value="<?= $e($profile['phone']) ?>"></div>
          <div class="field"><label for="wz-email">E-mail de contact</label><input type="email" id="wz-email" name="email" maxlength="254" value="<?= $e($profile['email']) ?>"></div>
        </div>
        <div class="field"><label for="wz-address">Adresse</label><input type="text" id="wz-address" name="address" maxlength="500" value="<?= $e($profile['address']) ?>"></div>
        <div class="field"><label for="wz-lang">Langue des documents envoyés à vos clients</label>
          <select id="wz-lang" name="document_language">
            <option value="fr"<?= $profile['document_language'] === 'fr' ? ' selected' : '' ?>>Français</option>
            <option value="en"<?= $profile['document_language'] === 'en' ? ' selected' : '' ?>>Anglais</option>
          </select></div>
        <div class="actions">
          <button type="submit" class="btn-primary btn-inline">Enregistrer et continuer</button>
          <button type="button" class="btn-link" data-skip>Passer</button>
        </div>
      </form>

      <form class="wz-step" data-step="2" id="wz-apps" novalidate hidden>
        <h2>2. Vos apps</h2>
        <p class="small muted">Chaque app est gratuite 30 jours, sans engagement. Vous pourrez en ajouter ou en retirer à tout moment depuis le tableau de bord.</p>
        <div class="wz-apps">
          <?php foreach ($catalog as $slug => $m): if ($m['status'] !== 'available') { continue; }
              $on = isset($enabled[$slug]); $over = in_array($slug, $ended, true); ?>
            <label class="wz-app">
              <input type="checkbox" name="apps" value="<?= $e($slug) ?>"<?= $on ? ' checked disabled' : '' ?><?= $over && !$on ? ' disabled' : '' ?>>
              <span><strong><?= $e($m['name']) ?></strong><span class="small muted"><?= $e($m['tagline']) ?><?= $on ? ' · déjà activée' : ($over ? ' · essai terminé' : '') ?></span></span>
            </label>
          <?php endforeach; ?>
        </div>
        <div class="actions">
          <button type="submit" class="btn-primary btn-inline">Activer et continuer</button>
          <button type="button" class="btn-link" data-skip>Passer</button>
        </div>
      </form>

      <form class="wz-step wz-invites" data-step="3" id="wz-team" novalidate hidden>
        <h2>3. Votre équipe</h2>
        <p class="small muted">Chaque personne reçoit un lien personnel<?= $mail_on ? ' par e-mail' : '' ?> pour choisir son mot de passe. Un membre fait le travail courant ; un administrateur règle aussi les apps et la facturation.</p>
        <?php for ($i = 0; $i < 3; $i++): ?>
          <div class="form-grid">
            <div class="field"><label for="wz-inv-<?= $i ?>">E-mail d’un collègue</label><input type="email" id="wz-inv-<?= $i ?>" name="email" maxlength="254" autocomplete="off"></div>
            <div class="field"><label for="wz-role-<?= $i ?>">Rôle</label>
              <select id="wz-role-<?= $i ?>" name="role">
                <option value="member" selected>Membre</option>
                <?php if ($isOwner): ?><option value="admin">Administrateur</option><?php endif; ?>
              </select></div>
          </div>
        <?php endfor; ?>
        <div class="actions">
          <button type="submit" class="btn-primary btn-inline">Inviter et terminer</button>
          <button type="button" class="btn-link" data-skip>Pas d’équipe pour l’instant</button>
        </div>
      </form>
    </section>
  </main>
  <script src="/assets/js/welcome.js"></script>
</body>
</html>
