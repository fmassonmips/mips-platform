<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $products
 * @var array<string,string> $profile
 * @var bool $can_manage
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$defaultCode = $profile['vat_number'] !== '' ? 'TC01' : 'TC03';
?>
<?php if ($can_manage): ?>
<section class="card">
  <h2 id="product-form-title">Nouveau produit</h2>
  <form id="sl-product-form" novalidate data-id="0" data-default-code="<?= $e($defaultCode) ?>">
    <div class="form-grid">
      <div class="field"><label for="pr-name">Nom</label><input type="text" id="pr-name" name="name" maxlength="150" required></div>
      <div class="field"><label for="pr-price">Prix affiché TTC (Rs)</label><input type="text" id="pr-price" name="price" inputmode="decimal" maxlength="15" required></div>
      <div class="field"><label for="pr-tax">TVA</label>
        <select id="pr-tax" name="tax_code"><?php foreach (Documents::TAX_CODES as $k => $c): ?><option value="<?= $e($k) ?>"<?= $k === $defaultCode ? ' selected' : '' ?>><?= $e($c['label']) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="pr-stock">Stock (vide = non suivi)</label><input type="text" id="pr-stock" name="stock" inputmode="numeric" maxlength="7"></div>
    </div>
    <div class="field"><label for="pr-desc">Description</label><textarea id="pr-desc" name="description" rows="2" maxlength="2000"></textarea></div>
    <div class="field"><label for="pr-image">Photo</label><input type="file" id="pr-image" accept="image/*">
      <img id="pr-preview" class="pr-preview" alt="" hidden>
      <span class="small muted">Réduite automatiquement à 800 px.</span>
      <label class="checkbox small" id="pr-remove-wrap" hidden><input type="checkbox" name="remove_image"> Retirer la photo</label></div>
    <label class="checkbox"><input type="checkbox" name="active" checked> En vente</label>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer le produit</button>
      <button type="reset" class="btn-link">Annuler</button>
    </div>
  </form>
</section>
<?php endif; ?>

<section class="card">
  <h2>Produits</h2>
  <?php if ($products === []): ?>
    <p class="muted">Aucun produit pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th></th><th>Produit</th><th class="num">Prix TTC</th><th>TVA</th><th class="num">Stock</th><th>Statut</th><?php if ($can_manage): ?><th></th><?php endif; ?></tr></thead>
      <tbody>
        <?php foreach ($products as $p): ?>
          <tr>
            <td><?php if ($p['image'] !== null): ?><img class="thumb" src="<?= $e($p['image']) ?>" alt=""><?php endif; ?></td>
            <td><?= $e($p['name']) ?></td>
            <td class="num"><?= $e(Money::format((int) $p['price_ttc_cents'], 'MUR')) ?></td>
            <td><?= $e(Documents::TAX_CODES[$p['tax_code']]['label'] ?? $p['tax_code']) ?></td>
            <td class="num<?= $p['stock'] !== null && (int) $p['stock'] <= 3 ? ' text-danger' : '' ?>"><?= $p['stock'] !== null ? (int) $p['stock'] : '—' ?></td>
            <td><?= (int) $p['active'] === 1 ? 'En vente' : '<span class="muted">Masqué</span>' ?></td>
            <?php if ($can_manage): ?>
              <td class="num"><button type="button" class="btn-link" data-edit-product="<?= $e(json_encode([
                  'id' => (int) $p['id'], 'name' => $p['name'], 'description' => $p['description'] ?? '', 'price' => Money::toInput((int) $p['price_ttc_cents']),
                  'tax_code' => $p['tax_code'], 'stock' => $p['stock'] !== null ? (string) $p['stock'] : '', 'active' => (int) $p['active'] === 1,
                  'has_image' => $p['image'] !== null,
              ], JSON_UNESCAPED_UNICODE)) ?>">Modifier</button></td>
            <?php endif; ?>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
