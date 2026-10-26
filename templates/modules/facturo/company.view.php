<?php
/**
 * Company profile printed on quotes and invoices, and MRA e-invoicing settings.
 *
 * @var callable $e
 * @var array<string,string> $profile
 * @var array{enabled:bool,username:string,ebs_id:string,has_password:bool} $mra
 * @var bool $can_manage
 */
$ro = $can_manage ? '' : ' disabled';
?>
<section class="card">
  <h2>Coordonnées de l'entreprise</h2>
  <p class="muted">Imprimées sur chaque devis et facture. La raison sociale et le BRN sont obligatoires pour émettre des factures.
     Sans n° TVA, les nouvelles lignes sont par défaut sans TVA.</p>
  <?php if (!$can_manage): ?>
    <p class="muted">Seul un propriétaire ou un administrateur peut modifier ces informations.</p>
  <?php endif; ?>
  <form id="company-form" novalidate>
    <div class="form-grid">
      <div class="field"><label for="o-name">Nom affiché</label><input type="text" id="o-name" name="name" maxlength="160" value="<?= $e($profile['name']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-legal">Raison sociale</label><input type="text" id="o-legal" name="legal_name" maxlength="200" value="<?= $e($profile['legal_name']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-brn">BRN</label><input type="text" id="o-brn" name="brn" maxlength="40" value="<?= $e($profile['brn']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-vat">N° TVA</label><input type="text" id="o-vat" name="vat_number" maxlength="40" value="<?= $e($profile['vat_number']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-email">E-mail</label><input type="email" id="o-email" name="email" maxlength="254" value="<?= $e($profile['email']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-phone">Téléphone</label><input type="text" id="o-phone" name="phone" maxlength="40" value="<?= $e($profile['phone']) ?>"<?= $ro ?>></div>
    </div>
    <div class="field"><label for="o-address">Adresse</label><textarea id="o-address" name="address" rows="2" maxlength="500"<?= $ro ?>><?= $e($profile['address']) ?></textarea></div>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
      <p id="company-saved" class="success" role="status" hidden>Enregistré.</p>
    <?php endif; ?>
  </form>
</section>

<section class="card">
  <h2>Facturation électronique MRA</h2>
  <p class="muted">Une fois activée, chaque facture et chaque avoir est transmis à la Mauritius Revenue Authority à l'émission
     et reçoit un IRN et un QR code imprimés dessus. Utilisez les identifiants de l'EBS enregistré pour votre entreprise
     sur le portail e-Invoicing de la MRA.</p>
  <?php if ($can_manage): ?>
  <form id="mra-form" novalidate>
    <label class="checkbox"><input type="checkbox" name="enabled"<?= $mra['enabled'] ? ' checked' : '' ?>> Fiscaliser les factures et les avoirs auprès de la MRA</label>
    <div class="form-grid">
      <div class="field"><label for="mra-user">Identifiant MRA</label><input type="text" id="mra-user" name="username" maxlength="100" autocomplete="off" value="<?= $e($mra['username']) ?>"></div>
      <div class="field"><label for="mra-pass">Mot de passe MRA</label><input type="password" id="mra-pass" name="password" maxlength="200" autocomplete="new-password" placeholder="<?= $mra['has_password'] ? 'Enregistré — laisser vide pour le conserver' : '' ?>"></div>
      <div class="field"><label for="mra-ebs">EBS MRA ID</label><input type="text" id="mra-ebs" name="ebs_id" maxlength="50" autocomplete="off" value="<?= $e($mra['ebs_id']) ?>"></div>
    </div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer</button>
      <button type="button" id="mra-test" class="btn-secondary">Tester la connexion</button>
    </div>
    <p id="mra-result" class="success" role="status" hidden></p>
  </form>
  <?php else: ?>
    <p>Statut : <strong><?= $mra['enabled'] ? 'activée' : 'désactivée' ?></strong></p>
  <?php endif; ?>
</section>
