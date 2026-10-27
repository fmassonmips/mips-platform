<?php
/**
 * Ticket entered by the team (phone call, counter, WhatsApp…).
 *
 * @var callable $e
 */
?>
<section class="card">
  <h2>Nouveau ticket</h2>
  <p class="muted">Pour une demande reçue par téléphone, au comptoir ou sur WhatsApp. Si vous indiquez un e-mail, le client reçoit un accusé de réception et le lien pour suivre sa demande.</p>
  <form id="fd-staff-new" novalidate>
    <div class="form-grid">
      <div class="field"><label for="n-name">Client</label><input type="text" id="n-name" name="name" maxlength="120" required></div>
      <div class="field"><label for="n-email">E-mail</label><input type="email" id="n-email" name="email" maxlength="254"></div>
      <div class="field"><label for="n-phone">Téléphone</label><input type="tel" id="n-phone" name="phone" maxlength="40"></div>
    </div>
    <div class="field"><label for="n-subject">Sujet</label><input type="text" id="n-subject" name="subject" maxlength="200" required></div>
    <div class="field"><label for="n-message">Demande</label><textarea id="n-message" name="message" rows="5" maxlength="10000" required></textarea></div>
    <div class="actions"><button type="submit" class="btn-primary btn-inline">Créer le ticket</button></div>
  </form>
</section>
