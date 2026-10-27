<?php
/**
 * Public booking link and online booking rules.
 *
 * @var callable $e
 * @var array<string,mixed> $settings
 * @var array<string,string> $profile
 * @var bool $can_manage
 * @var list<array{id:int,title:string}>|null $surveys  open Formelio forms; null when Formelio is off
 */
use App\RendezVous\Settings;

$url = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/rendezvous/book.php?o=' . $settings['public_token'];
$ro  = $can_manage ? '' : ' disabled';
?>
<section class="card">
  <h2>Lien de réservation</h2>
  <p class="muted">À partager sur WhatsApp, Facebook, Google Maps ou votre site. Les clients choisissent une prestation et un horaire libre.
     Page en <?= $profile['document_language'] === 'en' ? 'anglais' : 'français' ?> (langue des documents de l'entreprise).</p>
  <div class="share-box">
    <input type="text" id="rv-link" value="<?= $e($url) ?>" readonly aria-label="Lien de réservation">
    <button type="button" class="btn-secondary" id="rv-copy">Copier</button>
    <a class="btn-secondary" id="rv-whatsapp" href="https://wa.me/?text=<?= $e(rawurlencode('Prenez rendez-vous en ligne : ' . $url)) ?>" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn-secondary" href="<?= $e($url) ?>" target="_blank" rel="noopener">Ouvrir</a>
  </div>
  <?php if ($can_manage): ?>
    <p class="small"><button type="button" class="btn-link" id="rv-new-link">Créer un nouveau lien</button>
      <span class="muted">— l'ancien cessera de fonctionner.</span></p>
  <?php endif; ?>
</section>

<section class="card">
  <h2>Règles</h2>
  <form id="rv-settings-form" novalidate>
    <label class="checkbox"><input type="checkbox" name="booking_enabled"<?= $settings['booking_enabled'] ? ' checked' : '' ?><?= $ro ?>> Réservation en ligne ouverte</label>
    <div class="form-grid">
      <div class="field"><label for="r-step">Horaires proposés toutes les</label>
        <select id="r-step" name="slot_step_min"<?= $ro ?>>
          <?php foreach (Settings::STEPS as $m): ?><option value="<?= $m ?>"<?= $settings['slot_step_min'] === $m ? ' selected' : '' ?>><?= $m ?> minutes</option><?php endforeach; ?>
        </select></div>
      <div class="field"><label for="r-notice">Délai minimum avant un rendez-vous (minutes)</label>
        <input type="number" id="r-notice" name="min_notice_min" min="0" max="20160" value="<?= (int) $settings['min_notice_min'] ?>"<?= $ro ?>></div>
      <div class="field"><label for="r-days">Réservable jusqu'à (jours à l'avance)</label>
        <input type="number" id="r-days" name="max_days_ahead" min="1" max="365" value="<?= (int) $settings['max_days_ahead'] ?>"<?= $ro ?>></div>
      <div class="field"><label for="r-cancel">Annulation en ligne jusqu'à (minutes avant)</label>
        <input type="number" id="r-cancel" name="cancel_notice_min" min="0" max="20160" value="<?= (int) $settings['cancel_notice_min'] ?>"<?= $ro ?>></div>
      <div class="field"><label for="r-notify">Copie des réservations en ligne à</label>
        <input type="email" id="r-notify" name="notify_email" maxlength="254" value="<?= $e($settings['notify_email']) ?>" placeholder="e-mail de l'entreprise"<?= $ro ?>></div>
    </div>
    <div class="field"><label for="r-survey">Sondage de satisfaction envoyé quand un rendez-vous est marqué « Honoré »</label>
      <?php if ($surveys === null): ?>
        <p class="muted small">Activez Formelio pour envoyer un sondage par e-mail après chaque visite.</p>
      <?php else: ?>
        <select id="r-survey" name="survey_form_id"<?= $ro ?>>
          <option value="0">Aucun</option>
          <?php foreach ($surveys as $s): ?><option value="<?= $s['id'] ?>"<?= $settings['survey_form_id'] === $s['id'] ? ' selected' : '' ?>><?= $e($s['title']) ?></option><?php endforeach; ?>
        </select>
        <?php if ($surveys === []): ?><p class="muted small">Aucun formulaire ouvert : créez-en un dans Formelio (modèle « Satisfaction client ») et ouvrez-le.</p><?php endif; ?>
      <?php endif; ?></div>
    <div class="field"><label for="r-intro">Message d'accueil sur la page de réservation</label>
      <textarea id="r-intro" name="intro" rows="2" maxlength="500"<?= $ro ?>><?= $e($settings['intro']) ?></textarea></div>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
      <p id="rv-settings-saved" class="success" role="status" hidden>Enregistré.</p>
    <?php endif; ?>
  </form>
  <p class="muted small">Les clients qui laissent un e-mail reçoivent une confirmation, puis un rappel la veille
     (tâche planifiée <code>tools/rendezvous_reminders.php</code>). Pas de SMS ni de WhatsApp automatiques pour l'instant.</p>
</section>
