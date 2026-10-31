<?php
/**
 * @var callable $e
 * @var int $year
 * @var array<int,string> $members
 * @var array<int,list<array<string,mixed>>> $team
 * @var list<array<string,mixed>> $types
 */
use App\StaffZen\Leaves;
?>
<section class="card">
  <div class="card-head">
    <h2>Soldes <?= $year ?></h2>
    <div class="actions">
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=balances&amp;y=<?= $year - 1 ?>" aria-label="Année précédente">‹</a>
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=balances&amp;y=<?= $year + 1 ?>" aria-label="Année suivante">›</a>
    </div>
  </div>
  <p class="small muted">Droit annuel par personne : modifiez-le pour un contrat particulier, une arrivée en cours d'année ou un report (vide = droit par défaut du type). Restant = droit − pris − en attente.</p>
  <div class="table-wrap"><table class="table sz-balances">
    <thead><tr><th>Personne</th><?php foreach ($types as $t): ?><th><?= $e($t['name']) ?></th><?php endforeach; ?></tr></thead>
    <tbody>
      <?php foreach ($members as $uid => $name): ?>
        <tr>
          <th scope="row"><?= $e($name) ?></th>
          <?php foreach ($team[$uid] as $b): ?>
            <td>
              <?php if ($b['counted']): ?>
                <strong class="<?= $b['remaining'] < 0 ? 'text-danger' : '' ?>"><?= $e(Leaves::days((int) $b['remaining'])) ?></strong> <span class="small muted">restants</span><br>
                <span class="small muted">pris <?= $e(Leaves::days($b['taken'])) ?><?= $b['pending'] > 0 ? ' · attente ' . $e(Leaves::days($b['pending'])) : '' ?> · droit</span>
                <input type="text" class="sz-allow" inputmode="decimal" maxlength="6" value="<?= $b['custom'] ? $e(str_replace(' j', '', str_replace(',', '.', Leaves::days((int) $b['allowance'])))) : '' ?>"
                       placeholder="<?= $e(str_replace(' j', '', str_replace(',', '.', Leaves::days((int) $b['allowance'])))) ?>"
                       data-sz-allow data-user="<?= $uid ?>" data-type="<?= $b['type_id'] ?>" data-year="<?= $year ?>" aria-label="Droit <?= $e($b['name']) ?> de <?= $e($name) ?>">
              <?php else: ?>
                <?= $e(Leaves::days($b['taken'])) ?> <span class="small muted">pris</span>
              <?php endif; ?>
            </td>
          <?php endforeach; ?>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table></div>
</section>
