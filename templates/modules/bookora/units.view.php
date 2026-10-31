<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $units
 * @var array<string,string> $profile
 */
use App\Facturo\Documents;
use App\Facturo\Money;

$defaultCode = $profile['vat_number'] !== '' ? 'TC01' : 'TC03';
?>
<section class="card">
  <h2>Logements</h2>
  <?php if ($units === []): ?>
    <p class="muted">Aucun logement pour l'instant : ajoutez vos chambres, bungalows ou villas ci-dessous.</p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th></th><th>Logement</th><th class="num">Pers.</th><th class="num">Prix / nuit TTC</th><th class="num">Min.</th><th>Calendrier importé</th><th>Statut</th></tr></thead>
      <tbody>
        <?php foreach ($units as $u): ?>
          <tr>
            <td><?php if ($u['image'] !== null): ?><img class="thumb" src="<?= $e($u['image']) ?>" alt=""><?php endif; ?></td>
            <td><a href="/app.php?m=bookora&amp;p=unit&amp;id=<?= (int) $u['id'] ?>"><?= $e($u['name']) ?></a></td>
            <td class="num"><?= (int) $u['capacity'] ?></td>
            <td class="num"><?= $e(Money::format((int) $u['price_ttc_cents'], 'MUR')) ?></td>
            <td class="num"><?= (int) $u['min_nights'] ?> n.</td>
            <td class="small"><?= $u['ical_import_url'] === null ? '<span class="muted">—</span>' : ($u['ical_error'] !== null ? '<span class="text-danger">' . $e(mb_substr($u['ical_error'], 0, 60)) . '…</span>' : 'synchronisé') ?></td>
            <td><?= (int) $u['active'] === 1 ? 'Ouvert' : '<span class="muted">Masqué</span>' ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>

<section class="card">
  <h2>Nouveau logement</h2>
  <?php $unit = null; require __DIR__ . '/unit-form.partial.php'; ?>
</section>
