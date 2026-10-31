<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $units
 */
?>
<section class="card">
  <h2>Nouvelle réservation</h2>
  <p class="small muted">Pour une réservation prise par téléphone, WhatsApp ou sur place : elle est confirmée directement et bloque les dates (aussi dans le calendrier exporté vers Airbnb / Booking.com). Le client reçoit la confirmation s'il a un e-mail.</p>
  <?php if ($units === []): ?>
    <p class="muted">Aucun logement actif.</p>
  <?php else: ?>
    <form id="bk-manual" novalidate>
      <div class="form-grid">
        <div class="field"><label for="m-unit">Logement</label>
          <select id="m-unit" name="unit_id"><?php foreach ($units as $u): ?><option value="<?= (int) $u['id'] ?>"><?= $e($u['name']) ?> (<?= (int) $u['capacity'] ?> pers.)</option><?php endforeach; ?></select></div>
        <div class="field"><label for="m-in">Arrivée</label><input type="date" id="m-in" name="check_in" required></div>
        <div class="field"><label for="m-out">Départ</label><input type="date" id="m-out" name="check_out" required></div>
        <div class="field"><label for="m-guests">Personnes</label><input type="number" id="m-guests" name="guests" min="1" max="50" value="2" required></div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="m-name">Nom du client</label><input type="text" id="m-name" name="name" maxlength="120" required></div>
        <div class="field"><label for="m-phone">Téléphone</label><input type="tel" id="m-phone" name="phone" maxlength="40" required></div>
        <div class="field"><label for="m-email">E-mail (facultatif)</label><input type="email" id="m-email" name="email" maxlength="254"></div>
      </div>
      <div class="field"><label for="m-note">Note</label><input type="text" id="m-note" name="note" maxlength="500"></div>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer la réservation</button></div>
    </form>
  <?php endif; ?>
</section>
