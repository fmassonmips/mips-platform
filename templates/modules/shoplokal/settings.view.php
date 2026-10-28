<?php
/**
 * @var callable $e
 * @var array<string,mixed> $settings
 * @var array<string,string> $profile
 * @var bool $can_manage
 */
use App\Facturo\Money;

$s   = $settings;
$url = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/shoplokal/s.php?o=' . $s['public_token'];
$ro  = $can_manage ? '' : ' disabled';
$chk = static fn (bool $on): string => $on ? ' checked' : '';
?>
<section class="card">
  <h2>Votre boutique</h2>
  <p class="muted">Lien à partager sur WhatsApp, Facebook, Instagram ou Google. Page en <?= $profile['document_language'] === 'en' ? 'anglais' : 'français' ?>.
     <?= $s['shop_open'] ? '' : '<strong>La boutique est fermée</strong> : ouvrez-la ci-dessous quand vos produits sont prêts.' ?></p>
  <div class="share-box">
    <input type="text" id="sl-link" value="<?= $e($url) ?>" readonly aria-label="Lien de la boutique">
    <button type="button" class="btn-secondary" id="sl-copy">Copier</button>
    <a class="btn-secondary" href="https://wa.me/?text=<?= $e(rawurlencode('Notre boutique en ligne : ' . $url)) ?>" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn-secondary" href="<?= $e($url) ?>" target="_blank" rel="noopener">Ouvrir</a>
  </div>
  <?php if ($can_manage): ?><p class="small"><button type="button" class="btn-link" id="sl-new-link">Créer un nouveau lien</button> <span class="muted">— l'ancien cessera de fonctionner.</span></p><?php endif; ?>
</section>

<section class="card">
  <form id="sl-settings" novalidate>
    <label class="checkbox"><input type="checkbox" name="shop_open"<?= $chk($s['shop_open']) . $ro ?>> Boutique ouverte</label>
    <div class="field"><label for="s-intro">Message d'accueil</label><textarea id="s-intro" name="intro" rows="2" maxlength="500"<?= $ro ?>><?= $e($s['intro']) ?></textarea></div>

    <h3>Paiement</h3>
    <p class="muted small">Le paiement en ligne par carte arrivera avec la passerelle MIPS. En attendant, le client paie à réception ou vous envoie l'argent ; vous marquez la commande payée.</p>
    <label class="checkbox"><input type="checkbox" name="pay_cod"<?= $chk($s['pay_cod']) . $ro ?>> À la livraison ou au retrait</label>
    <label class="checkbox"><input type="checkbox" name="pay_bank"<?= $chk($s['pay_bank']) . $ro ?>> Virement bancaire</label>
    <div class="field"><label for="s-bank">Coordonnées bancaires affichées au client</label><input type="text" id="s-bank" name="bank_details" maxlength="300" value="<?= $e($s['bank_details']) ?>" placeholder="MCB · Ocean Tech Ltd · 000123456789"<?= $ro ?>></div>
    <label class="checkbox"><input type="checkbox" name="pay_juice"<?= $chk($s['pay_juice']) . $ro ?>> Juice</label>
    <div class="field"><label for="s-juice">Numéro Juice</label><input type="text" id="s-juice" name="juice_number" maxlength="40" value="<?= $e($s['juice_number']) ?>"<?= $ro ?>></div>

    <h3>Livraison et retrait</h3>
    <label class="checkbox"><input type="checkbox" name="delivery_enabled"<?= $chk($s['delivery_enabled']) . $ro ?>> Livraison</label>
    <div class="form-grid">
      <div class="field"><label for="s-fee">Frais de livraison HT (Rs, 0 = offerte)</label><input type="text" id="s-fee" name="delivery_fee" inputmode="decimal" maxlength="15" value="<?= $e(Money::toInput($s['delivery_fee_cents'])) ?>"<?= $ro ?>></div>
      <div class="field"><label for="s-free">Offerte dès (Rs TTC d'articles, vide = jamais)</label><input type="text" id="s-free" name="free_delivery_from" inputmode="decimal" maxlength="15" value="<?= $s['free_delivery_from_cents'] !== null ? $e(Money::toInput($s['free_delivery_from_cents'])) : '' ?>"<?= $ro ?>></div>
    </div>
    <label class="checkbox"><input type="checkbox" name="pickup_enabled"<?= $chk($s['pickup_enabled']) . $ro ?>> Retrait sur place</label>
    <div class="field"><label for="s-pickup">Adresse de retrait</label><input type="text" id="s-pickup" name="pickup_address" maxlength="300" value="<?= $e($s['pickup_address']) ?>"<?= $ro ?>></div>

    <div class="field"><label for="s-notify">Prévenir à chaque commande (e-mail)</label><input type="email" id="s-notify" name="notify_email" maxlength="254" value="<?= $e($s['notify_email']) ?>"<?= $ro ?>></div>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
    <?php endif; ?>
  </form>
</section>
