<?php
/**
 * @var callable $e
 * @var array<string,mixed> $settings
 * @var array<string,string> $profile
 * @var bool $can_manage
 */
$url = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/flowdesk/new.php?o=' . $settings['public_token'];
$ro  = $can_manage ? '' : ' disabled';
?>
<section class="card">
  <h2>Formulaire de contact</h2>
  <p class="muted">À mettre sur votre site, Facebook ou en signature d'e-mail. Chaque envoi crée un ticket ; le client suit sa demande et répond sur sa page privée.
     Page en <?= $profile['document_language'] === 'en' ? 'anglais' : 'français' ?> (langue des documents de l'entreprise).</p>
  <div class="share-box">
    <input type="text" id="fd-link" value="<?= $e($url) ?>" readonly aria-label="Lien du formulaire de contact">
    <button type="button" class="btn-secondary" id="fd-copy">Copier</button>
    <a class="btn-secondary" href="<?= $e($url) ?>" target="_blank" rel="noopener">Ouvrir</a>
  </div>
  <?php if ($can_manage): ?>
    <p class="small"><button type="button" class="btn-link" id="fd-new-link">Créer un nouveau lien</button> <span class="muted">— l'ancien cessera de fonctionner.</span></p>
  <?php endif; ?>
</section>

<section class="card">
  <h2>Réglages</h2>
  <form id="fd-settings" novalidate>
    <label class="checkbox"><input type="checkbox" name="form_enabled"<?= $settings['form_enabled'] ? ' checked' : '' ?><?= $ro ?>> Formulaire de contact ouvert</label>
    <div class="form-grid">
      <div class="field"><label for="s-notify">Prévenir à chaque nouveau ticket (e-mail)</label>
        <input type="email" id="s-notify" name="notify_email" maxlength="254" value="<?= $e($settings['notify_email']) ?>"<?= $ro ?>></div>
    </div>
    <div class="field"><label for="s-intro">Message d'accueil du formulaire</label>
      <textarea id="s-intro" name="intro" rows="2" maxlength="500"<?= $ro ?>><?= $e($settings['intro']) ?></textarea></div>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
      <p id="fd-saved" class="success" role="status" hidden>Enregistré.</p>
    <?php endif; ?>
  </form>
  <p class="muted small">Les réponses du client à un ticket assigné sont envoyées à la personne assignée ; sinon à l'adresse ci-dessus.
     Formelio peut aussi créer un ticket par réponse (option dans chaque formulaire).</p>
</section>
