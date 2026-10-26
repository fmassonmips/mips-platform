<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $clients
 */
?>
<section class="card">
  <h2 id="client-form-title">Nouveau client</h2>
  <form id="client-form" novalidate data-id="0">
    <div class="form-grid">
      <div class="field"><label for="c-name">Nom</label><input type="text" id="c-name" name="name" maxlength="200" required></div>
      <div class="field"><label for="c-email">E-mail</label><input type="email" id="c-email" name="email" maxlength="254"></div>
      <div class="field"><label for="c-phone">Téléphone</label><input type="text" id="c-phone" name="phone" maxlength="40"></div>
      <div class="field"><label for="c-brn">BRN</label><input type="text" id="c-brn" name="brn" maxlength="40"></div>
      <div class="field"><label for="c-vat">N° TVA</label><input type="text" id="c-vat" name="vat_number" maxlength="40"></div>
    </div>
    <div class="field"><label for="c-address">Adresse</label><textarea id="c-address" name="address" rows="2" maxlength="500"></textarea></div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer le client</button>
      <button type="reset" class="btn-link">Annuler</button>
    </div>
  </form>
</section>

<section class="card">
  <h2>Clients</h2>
  <?php if ($clients === []): ?>
    <p class="muted">Aucun client pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nom</th><th>E-mail</th><th>BRN</th><th></th></tr></thead>
        <tbody>
          <?php foreach ($clients as $c): ?>
            <tr>
              <td><?= $e($c['name']) ?></td>
              <td><?= $e($c['email'] ?? '') ?></td>
              <td><?= $e($c['brn'] ?? '') ?></td>
              <td class="num">
                <button type="button" class="btn-link" data-edit-client="<?= $e(json_encode($c, JSON_UNESCAPED_UNICODE)) ?>">Modifier</button>
                <button type="button" class="btn-link" data-delete-client="<?= (int) $c['id'] ?>">Supprimer</button>
              </td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
