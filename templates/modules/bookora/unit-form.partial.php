<?php
/**
 * @var callable $e
 * @var array<string,mixed>|null $unit
 * @var string $defaultCode
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$u    = $unit;
$code = $u !== null ? (string) $u['tax_code'] : $defaultCode;
?>
<form id="bk-unit-form" novalidate data-id="<?= $u !== null ? (int) $u['id'] : 0 ?>">
  <div class="form-grid">
    <div class="field"><label for="u-name">Nom</label><input type="text" id="u-name" name="name" maxlength="120" value="<?= $e($u['name'] ?? '') ?>" placeholder="Bungalow vue mer" required></div>
    <div class="field"><label for="u-price">Prix par nuit TTC (Rs)</label><input type="text" id="u-price" name="price" inputmode="decimal" maxlength="15" value="<?= $u !== null ? $e(Money::toInput((int) $u['price_ttc_cents'])) : '' ?>" required></div>
    <div class="field"><label for="u-tax">TVA</label>
      <select id="u-tax" name="tax_code"><?php foreach (Documents::TAX_CODES as $k => $c): ?><option value="<?= $e($k) ?>"<?= $k === $code ? ' selected' : '' ?>><?= $e($c['label']) ?></option><?php endforeach; ?></select></div>
    <div class="field"><label for="u-cap">Personnes max.</label><input type="number" id="u-cap" name="capacity" min="1" max="50" value="<?= (int) ($u['capacity'] ?? 2) ?>"></div>
    <div class="field"><label for="u-min">Nuits minimum</label><input type="number" id="u-min" name="min_nights" min="1" max="30" value="<?= (int) ($u['min_nights'] ?? 1) ?>"></div>
  </div>
  <div class="field"><label for="u-desc">Description</label><textarea id="u-desc" name="description" rows="3" maxlength="2000" placeholder="Lit double, climatisation, terrasse, petit-déjeuner inclus…"><?= $e($u['description'] ?? '') ?></textarea></div>
  <div class="field"><label for="pr-image">Photo</label><input type="file" id="pr-image" accept="image/*">
    <img id="pr-preview" class="pr-preview" alt=""<?= ($u['image'] ?? null) !== null ? ' src="' . $e($u['image']) . '"' : ' hidden' ?>>
    <span class="small muted">Réduite automatiquement à 800 px.</span>
    <?php if (($u['image'] ?? null) !== null): ?><label class="checkbox small"><input type="checkbox" name="remove_image"> Retirer la photo</label><?php endif; ?></div>
  <label class="checkbox"><input type="checkbox" name="active"<?= $u === null || (int) $u['active'] === 1 ? ' checked' : '' ?>> Ouvert à la réservation</label>
  <div class="actions">
    <button type="submit" class="btn-primary btn-inline"><?= $u === null ? 'Ajouter le logement' : 'Enregistrer' ?></button>
    <?php if ($u !== null): ?><button type="button" class="btn-link danger" id="bk-delete-unit" data-id="<?= (int) $u['id'] ?>">Supprimer</button><?php endif; ?>
  </div>
</form>
