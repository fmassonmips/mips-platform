<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $services
 * @var bool $can_manage
 */
use App\Facturo\Money;
?>
<?php if ($can_manage): ?>
<section class="card">
  <h2 id="service-form-title">Nouvelle prestation</h2>
  <form id="service-form" novalidate data-id="0">
    <div class="form-grid">
      <div class="field"><label for="s-name">Nom</label><input type="text" id="s-name" name="name" maxlength="120" required></div>
      <div class="field"><label for="s-duration">Durée (minutes)</label><input type="number" id="s-duration" name="duration_min" min="5" max="720" step="5" value="30" required></div>
      <div class="field"><label for="s-price">Prix (Rs, facultatif)</label><input type="text" id="s-price" name="price" inputmode="decimal" maxlength="15"></div>
    </div>
    <label class="checkbox"><input type="checkbox" name="active" checked> Réservable</label>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer la prestation</button>
      <button type="reset" class="btn-link">Annuler</button>
    </div>
  </form>
</section>
<?php endif; ?>

<section class="card">
  <h2>Prestations</h2>
  <?php if ($services === []): ?>
    <p class="muted">Aucune prestation pour l'instant. Exemple : « Coupe femme », 45 minutes, Rs 800.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Prestation</th><th class="num">Durée</th><th class="num">Prix</th><th>Statut</th><?php if ($can_manage): ?><th></th><?php endif; ?></tr></thead>
        <tbody>
          <?php foreach ($services as $s): ?>
            <tr>
              <td><?= $e($s['name']) ?></td>
              <td class="num"><?= (int) $s['duration_min'] ?> min</td>
              <td class="num"><?= $s['price_cents'] !== null ? $e(Money::format((int) $s['price_cents'], 'MUR')) : '—' ?></td>
              <td><?= (int) $s['active'] === 1 ? 'Réservable' : '<span class="muted">Masquée</span>' ?></td>
              <?php if ($can_manage): ?>
                <td class="num"><button type="button" class="btn-link" data-edit-service="<?= $e(json_encode([
                    'id' => (int) $s['id'], 'name' => $s['name'], 'duration_min' => (int) $s['duration_min'],
                    'price' => $s['price_cents'] !== null ? Money::toInput((int) $s['price_cents']) : '', 'active' => (int) $s['active'] === 1,
                ], JSON_UNESCAPED_UNICODE)) ?>">Modifier</button></td>
              <?php endif; ?>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
