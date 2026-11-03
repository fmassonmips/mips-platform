<?php
/**
 * Catalogue: the company's usual products and services, picked in the draft editor.
 *
 * @var callable $e
 * @var list<array<string,mixed>> $items
 * @var array<string,string> $profile
 * @var bool $can_manage
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$defaultTax = ($profile['vat_number'] ?? '') !== '' ? 'TC01' : 'TC03';
?>
<?php if ($can_manage): ?>
<section class="card">
  <h2 id="item-form-title">Nouvel article</h2>
  <form id="item-form" novalidate data-id="0">
    <div class="form-grid">
      <div class="field"><label for="i-name">Libellé (repris sur la facture)</label><input type="text" id="i-name" name="name" maxlength="200" required></div>
      <div class="field"><label for="i-price">Prix unitaire HT</label><input type="text" id="i-price" name="unit_price" inputmode="decimal" placeholder="1500.00" required></div>
      <div class="field"><label for="i-tax">TVA</label>
        <select id="i-tax" name="tax_code">
          <?php foreach (Documents::TAX_CODES as $code => $t): ?>
            <option value="<?= $e($code) ?>"<?= $code === $defaultTax ? ' selected' : '' ?>><?= $e($t['label']) ?></option>
          <?php endforeach; ?>
        </select></div>
      <div class="field"><label for="i-nature">Bien ou service</label>
        <select id="i-nature" name="nature">
          <?php foreach (Documents::NATURES as $code => $label): ?>
            <option value="<?= $e($code) ?>"<?= $code === 'SERVICES' ? ' selected' : '' ?>><?= $e($label) ?></option>
          <?php endforeach; ?>
        </select></div>
    </div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer l’article</button>
      <button type="reset" class="btn-link">Annuler</button>
    </div>
  </form>
</section>
<?php endif; ?>

<section class="card">
  <div class="card-head"><h2>Articles</h2></div>
  <p class="muted small">Vos prestations et produits habituels : dans un devis ou une facture, « Ajouter un article du catalogue » remplit la ligne. Modifier un article ne change pas les documents déjà faits.</p>
  <?php if ($items === []): ?>
    <p class="muted">Aucun article pour l'instant.<?= $can_manage ? '' : ' Le propriétaire ou un administrateur peut en ajouter.' ?></p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table" id="items-table">
        <thead><tr><th>Libellé</th><th>Nature</th><th>TVA</th><th class="num">Prix HT</th><?= $can_manage ? '<th></th>' : '' ?></tr></thead>
        <tbody>
          <?php foreach ($items as $i): ?>
            <tr>
              <td><?= $e($i['name']) ?></td>
              <td><?= $e(Documents::NATURES[$i['nature']] ?? $i['nature']) ?></td>
              <td><?= $e(Documents::TAX_CODES[$i['tax_code']]['label'] ?? $i['tax_code']) ?></td>
              <td class="num"><?= $e(Money::format($i['unit_price_cents'], 'MUR')) ?></td>
              <?php if ($can_manage): ?>
                <td class="num">
                  <button type="button" class="btn-link" data-edit-item="<?= $e(json_encode(['id' => $i['id'], 'name' => $i['name'], 'unit_price' => Money::toInput($i['unit_price_cents']), 'tax_code' => $i['tax_code'], 'nature' => $i['nature']], JSON_UNESCAPED_UNICODE)) ?>">Modifier</button>
                  <button type="button" class="btn-link" data-delete-item="<?= (int) $i['id'] ?>">Supprimer</button>
                </td>
              <?php endif; ?>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
