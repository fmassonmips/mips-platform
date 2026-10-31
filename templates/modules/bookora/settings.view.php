<?php
/**
 * @var callable $e
 * @var array<string,mixed> $settings
 * @var array<string,string> $profile
 */
$s   = $settings;
$url = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/bookora/s.php?o=' . $s['public_token'];
?>
<section class="card">
  <h2>Votre page de réservation</h2>
  <p class="muted">À mettre sur votre site, Facebook, Google Maps ou WhatsApp. Page en <?= $profile['document_language'] === 'en' ? 'anglais' : 'français' ?>.
    <?= $s['booking_open'] ? '' : '<strong>Les réservations en ligne sont fermées</strong> : ouvrez-les ci-dessous quand vos logements sont prêts.' ?></p>
  <div class="share-box">
    <input type="text" id="bk-link" value="<?= $e($url) ?>" readonly aria-label="Lien de réservation">
    <button type="button" class="btn-secondary" data-copy="bk-link">Copier</button>
    <a class="btn-secondary" href="https://wa.me/?text=<?= $e(rawurlencode('Réservez en ligne : ' . $url)) ?>" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn-secondary" href="<?= $e($url) ?>" target="_blank" rel="noopener">Ouvrir</a>
  </div>
  <p class="small"><button type="button" class="btn-link" id="bk-new-link">Créer un nouveau lien</button> <span class="muted">— l'ancien cessera de fonctionner.</span></p>
</section>

<section class="card">
  <form id="bk-settings" novalidate>
    <label class="checkbox"><input type="checkbox" name="booking_open"<?= $s['booking_open'] ? ' checked' : '' ?>> Réservations en ligne ouvertes</label>
    <div class="field"><label for="st-intro">Message d'accueil</label><textarea id="st-intro" name="intro" rows="2" maxlength="500"><?= $e($s['intro']) ?></textarea></div>
    <div class="form-grid">
      <div class="field"><label for="st-ci">Arrivée à partir de</label><input type="time" id="st-ci" name="checkin_time" value="<?= $e($s['checkin_time']) ?>"></div>
      <div class="field"><label for="st-co">Départ avant</label><input type="time" id="st-co" name="checkout_time" value="<?= $e($s['checkout_time']) ?>"></div>
      <div class="field"><label for="st-dep">Acompte (% du séjour)</label><input type="number" id="st-dep" name="deposit_percent" min="0" max="100" value="<?= (int) $s['deposit_percent'] ?>"></div>
      <div class="field"><label for="st-hold">Délai pour confirmer (heures)</label><input type="number" id="st-hold" name="hold_hours" min="12" max="168" value="<?= (int) $s['hold_hours'] ?>"></div>
    </div>
    <p class="small muted">Une demande en ligne bloque les dates pendant ce délai ; confirmez-la à réception de l'acompte, sinon elle expire et les dates se libèrent. Le paiement par carte arrivera avec la passerelle MIPS.</p>
    <div class="form-grid">
      <div class="field"><label for="st-bank">Coordonnées bancaires (acompte par virement)</label><input type="text" id="st-bank" name="bank_details" maxlength="300" value="<?= $e($s['bank_details']) ?>" placeholder="MCB · Villa Corail Ltd · 000123456789"></div>
      <div class="field"><label for="st-juice">Numéro Juice</label><input type="text" id="st-juice" name="juice_number" maxlength="40" value="<?= $e($s['juice_number']) ?>"></div>
    </div>
    <div class="field"><label for="st-notify">Prévenir à chaque demande (e-mail)</label><input type="email" id="st-notify" name="notify_email" maxlength="254" value="<?= $e($s['notify_email']) ?>"></div>
    <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
  </form>
</section>
