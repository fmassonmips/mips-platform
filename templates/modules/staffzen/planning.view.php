<?php
/**
 * @var callable $e
 * @var DateTimeImmutable $start
 * @var array<int,string> $members
 * @var array<int,array<string,array{status:string,type:string,half:?string}>> $cells
 * @var array<string,string> $holidays
 * @var array<string,string> $away
 * @var array{work_days:string} $settings
 * @var bool $can_manage
 * @var int $userId
 */
use App\StaffZen\Leaves;

$months = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
$dow    = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
$nDays  = (int) $start->format('t');
$today  = Leaves::today();
?>
<section class="card">
  <div class="card-head">
    <h2>Planning · <?= $e(ucfirst($months[(int) $start->format('n')]) . ' ' . $start->format('Y')) ?></h2>
    <div class="actions">
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=planning&amp;mo=<?= $e($start->modify('-1 month')->format('Y-m')) ?>" aria-label="Mois précédent">‹</a>
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=planning">Ce mois-ci</a>
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=planning&amp;mo=<?= $e($start->modify('+1 month')->format('Y-m')) ?>" aria-label="Mois suivant">›</a>
    </div>
  </div>
  <p class="small"><strong>Absents aujourd'hui :</strong>
    <?php if ($away === []): ?>personne.<?php else: $i = 0; foreach ($away as $name => $half): ?><?= $i++ > 0 ? ', ' : '' ?><?= $e($name) ?><?= $half !== '' ? ' (' . $e($half) . ')' : '' ?><?php endforeach; endif; ?></p>
  <div class="table-wrap sz-cal-wrap">
    <table class="sz-cal">
      <thead>
        <tr><th scope="col" class="sz-name">Équipe</th>
          <?php for ($d = 1; $d <= $nDays; $d++): $date = $start->format('Y-m-') . str_pad((string) $d, 2, '0', STR_PAD_LEFT); $n = (int) (new DateTimeImmutable($date))->format('N'); ?>
            <th scope="col" class="<?= $settings['work_days'][$n - 1] === '0' || isset($holidays[$date]) ? 'is-off' : '' ?><?= $date === $today ? ' is-today' : '' ?>"<?= isset($holidays[$date]) ? ' title="' . $e($holidays[$date]) . '"' : '' ?>><span><?= $dow[$n - 1] ?></span><?= $d ?></th>
          <?php endfor; ?>
        </tr>
      </thead>
      <tbody>
        <?php foreach ($members as $uid => $name): ?>
          <tr>
            <th scope="row" class="sz-name"><?= $e($name) ?></th>
            <?php for ($d = 1; $d <= $nDays; $d++):
                $date = $start->format('Y-m-') . str_pad((string) $d, 2, '0', STR_PAD_LEFT);
                $n    = (int) (new DateTimeImmutable($date))->format('N');
                $off  = $settings['work_days'][$n - 1] === '0' || isset($holidays[$date]);
                $c    = $cells[$uid][$date] ?? null;
                // Leave type (e.g. sick leave) is shown to managers and to the person only.
                $label = $c === null ? '' : ($can_manage || $uid === $userId ? $c['type'] : 'Absent') . ($c['status'] === 'pending' ? ' (en attente)' : '') . ($c['half'] !== null ? ' — ' . Leaves::HALVES[$c['half']] : '');
            ?>
              <td class="<?= $off ? 'is-off' : '' ?><?= $c !== null && !$off ? ' sz-' . $c['status'] : '' ?><?= $date === $today ? ' is-today' : '' ?>"<?= $c !== null && !$off ? ' title="' . $e($label) . '"' : '' ?>><?= $c !== null && !$off ? ($c['half'] !== null ? '½' : '') . '<span class="sr-only">' . $e($label) . '</span>' : '' ?></td>
            <?php endfor; ?>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <p class="small muted sz-legend"><span class="sz-key sz-approved"></span> accordé <span class="sz-key sz-pending"></span> en attente <span class="sz-key is-off"></span> non travaillé ou férié · ½ demi-journée</p>
</section>
