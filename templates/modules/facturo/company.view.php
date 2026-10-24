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
  <h2>Company details</h2>
  <p class="muted">Printed on every quote and invoice. Legal name and BRN are required to issue invoices.
     Without a VAT number, new lines default to 0% VAT.</p>
  <?php if (!$can_manage): ?>
    <p class="muted">Only an owner or admin can edit these details.</p>
  <?php endif; ?>
  <form id="company-form" novalidate>
    <div class="form-grid">
      <div class="field"><label for="o-name">Display name</label><input type="text" id="o-name" name="name" maxlength="160" value="<?= $e($profile['name']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-legal">Legal name</label><input type="text" id="o-legal" name="legal_name" maxlength="200" value="<?= $e($profile['legal_name']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-brn">BRN</label><input type="text" id="o-brn" name="brn" maxlength="40" value="<?= $e($profile['brn']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-vat">VAT number</label><input type="text" id="o-vat" name="vat_number" maxlength="40" value="<?= $e($profile['vat_number']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-email">Email</label><input type="email" id="o-email" name="email" maxlength="254" value="<?= $e($profile['email']) ?>"<?= $ro ?>></div>
      <div class="field"><label for="o-phone">Phone</label><input type="text" id="o-phone" name="phone" maxlength="40" value="<?= $e($profile['phone']) ?>"<?= $ro ?>></div>
    </div>
    <div class="field"><label for="o-address">Address</label><textarea id="o-address" name="address" rows="2" maxlength="500"<?= $ro ?>><?= $e($profile['address']) ?></textarea></div>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Save</button></div>
      <p id="company-saved" class="success" role="status" hidden>Saved.</p>
    <?php endif; ?>
  </form>
</section>

<section class="card">
  <h2>MRA e-invoicing</h2>
  <p class="muted">When enabled, every invoice and credit note is sent to the Mauritius Revenue Authority when issued,
     and receives an IRN and a QR code printed on it. Use the credentials of the EBS registered for your company
     on the MRA e-Invoicing portal.</p>
  <?php if ($can_manage): ?>
  <form id="mra-form" novalidate>
    <label class="checkbox"><input type="checkbox" name="enabled"<?= $mra['enabled'] ? ' checked' : '' ?>> Fiscalise invoices and credit notes with MRA</label>
    <div class="form-grid">
      <div class="field"><label for="mra-user">MRA username</label><input type="text" id="mra-user" name="username" maxlength="100" autocomplete="off" value="<?= $e($mra['username']) ?>"></div>
      <div class="field"><label for="mra-pass">MRA password</label><input type="password" id="mra-pass" name="password" maxlength="200" autocomplete="new-password" placeholder="<?= $mra['has_password'] ? 'Saved — leave empty to keep' : '' ?>"></div>
      <div class="field"><label for="mra-ebs">EBS MRA ID</label><input type="text" id="mra-ebs" name="ebs_id" maxlength="50" autocomplete="off" value="<?= $e($mra['ebs_id']) ?>"></div>
    </div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Save</button>
      <button type="button" id="mra-test" class="btn-secondary">Test connection</button>
    </div>
    <p id="mra-result" class="success" role="status" hidden></p>
  </form>
  <?php else: ?>
    <p>Status: <strong><?= $mra['enabled'] ? 'enabled' : 'disabled' ?></strong></p>
  <?php endif; ?>
</section>
