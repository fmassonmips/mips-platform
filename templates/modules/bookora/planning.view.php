<?php
/**
 * @var callable $e
 * @var DateTimeImmutable $start
 * @var list<array<string,mixed>> $units
 * @var array<int,array<string,array{kind:string,label:string,id:?int}>> $cells
 * @var array{arrivals:list<array<string,mixed>>,departures:list<array<string,mixed>>} $today_mv
 * @var list<array<string,mixed>> $warnings
 * @var DateTimeImmutable $now
 */
$months = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
$dow    = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
$nDays  = (int) $start->format('t');
$today  = $now->format('Y-m-d');
$names  = static fn (array $list): string => implode(', ', array_map(static fn (array $b): string => $b['guest_name'] . ' (' . $b['unit_name'] . ')', $list));
?>
<?php foreach ($warnings as $w): ?>
  <section class="card bk-warning"><p><strong><?= $e($w['name']) ?> :</strong> <?= $e($w['ical_error']) ?> <a href="/app.php?m=bookora&amp;p=unit&amp;id=<?= (int) $w['id'] ?>">Voir le logement</a></p></section>
<?php endforeach; ?>
<section class="card">
  <div class="card-head">
    <h2>Planning · <?= $e(ucfirst($months[(int) $start->format('n')]) . ' ' . $start->format('Y')) ?></h2>
    <div class="actions">
      <a class="btn-secondary" href="/app.php?m=bookora&amp;mo=<?= $e($start->modify('-1 month')->format('Y-m')) ?>" aria-label="Mois précédent">‹</a>
      <a class="btn-secondary" href="/app.php?m=bookora">Ce mois-ci</a>
      <a class="btn-secondary" href="/app.php?m=bookora&amp;mo=<?= $e($start->modify('+1 month')->format('Y-m')) ?>" aria-label="Mois suivant">›</a>
    </div>
  </div>
  <p class="small"><strong>Aujourd'hui :</strong>
    arrivées <?= $today_mv['arrivals'] === [] ? 'aucune' : $e($names($today_mv['arrivals'])) ?> ·
    départs <?= $today_mv['departures'] === [] ? 'aucun' : $e($names($today_mv['departures'])) ?></p>
  <?php if ($units === []): ?>
    <p class="muted">Aucun logement actif. <a href="/app.php?m=bookora&amp;p=units">Ajoutez vos logements</a>.</p>
  <?php else: ?>
    <div class="table-wrap sz-cal-wrap">
      <table class="sz-cal bk-cal">
        <thead>
          <tr><th scope="col" class="sz-name">Logement</th>
            <?php for ($d = 1; $d <= $nDays; $d++): $date = $start->format('Y-m-') . str_pad((string) $d, 2, '0', STR_PAD_LEFT); $n = (int) (new DateTimeImmutable($date))->format('N'); ?>
              <th scope="col" class="<?= $n >= 6 ? 'is-weekend' : '' ?><?= $date === $today ? ' is-today' : '' ?>"><span><?= $dow[$n - 1] ?></span><?= $d ?></th>
            <?php endfor; ?>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($units as $u): $uid = (int) $u['id']; ?>
            <tr>
              <th scope="row" class="sz-name"><?= $e($u['name']) ?></th>
              <?php for ($d = 1; $d <= $nDays; $d++):
                  $date = $start->format('Y-m-') . str_pad((string) $d, 2, '0', STR_PAD_LEFT);
                  $c    = $cells[$uid][$date] ?? null;
                  $prev = $cells[$uid][(new DateTimeImmutable($date))->modify('-1 day')->format('Y-m-d')] ?? null;
                  $first = $c !== null && ($prev === null || $prev['label'] !== $c['label'] || $d === 1);
              ?>
                <td class="<?= $c !== null ? 'bk-' . $c['kind'] : '' ?><?= $date === $today ? ' is-today' : '' ?>"<?= $c !== null ? ' title="' . $e($c['label']) . '"' : '' ?>><?php if ($c !== null && $c['id'] !== null): ?><a href="/app.php?m=bookora&amp;p=booking&amp;id=<?= $c['id'] ?>" aria-label="<?= $e($c['label']) ?>"><?= $first ? $e(mb_substr(explode(' ', $c['label'], 2)[1] ?? '', 0, 3)) : '' ?></a><?php elseif ($c !== null): ?><span class="sr-only"><?= $e($c['label']) ?></span><?php endif; ?></td>
              <?php endfor; ?>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <p class="small muted sz-legend"><span class="sz-key bk-booked"></span> confirmée <span class="sz-key bk-held"></span> à confirmer (dates bloquées) <span class="sz-key bk-block"></span> fermé <span class="sz-key bk-ical"></span> calendrier importé (Airbnb, Booking.com…)</p>
  <?php endif; ?>
</section>
