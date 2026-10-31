<?php
/**
 * Day agenda with a week strip, status actions and a manual booking form.
 *
 * @var callable $e
 * @var string $date
 * @var DateTimeImmutable $day
 * @var DateTimeImmutable $monday
 * @var array<string,int> $counts
 * @var list<array<string,mixed>> $appointments
 * @var array<string,array{id:int,balance_cents:int}>|null $loyalty
 * @var list<array<string,mixed>> $services
 * @var list<array<string,mixed>> $staff
 */
use App\Facturo\Money;
use App\Format;
use App\RendezVous\Booking;
use App\RendezVous\Staff;

$short = [1 => 'Lun', 2 => 'Mar', 3 => 'Mer', 4 => 'Jeu', 5 => 'Ven', 6 => 'Sam', 7 => 'Dim'];
$today = Booking::now()->format('Y-m-d');
$link  = static fn (string $d): string => '/app.php?m=rendezvous&amp;d=' . $d;
?>
<section class="card">
  <div class="card-head">
    <h2><?= $e(Staff::WEEKDAYS[(int) $day->format('N')]) ?> <?= $e(Format::date($date)) ?></h2>
    <div class="actions">
      <a class="btn-secondary" href="<?= $link($day->modify('-1 day')->format('Y-m-d')) ?>" aria-label="Jour précédent">‹</a>
      <?php if ($date !== $today): ?><a class="btn-secondary" href="<?= $link($today) ?>">Aujourd'hui</a><?php endif; ?>
      <a class="btn-secondary" href="<?= $link($day->modify('+1 day')->format('Y-m-d')) ?>" aria-label="Jour suivant">›</a>
      <form id="rv-goto" class="inline-form ro-ok"><input type="date" name="d" value="<?= $e($date) ?>" aria-label="Aller à la date"></form>
    </div>
  </div>

  <nav class="week-strip" aria-label="Semaine">
    <?php for ($i = 0; $i < 7; $i++): $d = $monday->modify("+$i days")->format('Y-m-d'); ?>
      <a href="<?= $link($d) ?>" class="<?= $d === $date ? 'is-current' : '' ?><?= $d === $today ? ' is-today' : '' ?>">
        <span><?= $short[$i + 1] ?> <?= (int) substr($d, 8, 2) ?></span>
        <strong><?= (int) ($counts[$d] ?? 0) ?></strong>
      </a>
    <?php endfor; ?>
  </nav>

  <?php if ($appointments === []): ?>
    <p class="muted">Aucun rendez-vous ce jour-là.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table agenda">
        <thead><tr><th>Heure</th><th>Prestation</th><th>Avec</th><th>Client</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          <?php foreach ($appointments as $a): $st = (string) $a['status']; $cb = $a['phone'] !== null ? ($loyalty[$a['phone']] ?? null) : null; ?>
            <tr class="<?= $st === 'cancelled' ? 'is-cancelled' : '' ?>">
              <td class="nowrap"><strong><?= $e(substr((string) $a['starts_at'], 11, 5)) ?></strong>–<?= $e(substr((string) $a['ends_at'], 11, 5)) ?></td>
              <td><?= $e($a['service_name']) ?></td>
              <td><?= $e($a['staff_name']) ?></td>
              <td>
                <?= $e($a['customer_name']) ?><?php if ($a['source'] === 'online'): ?> <span class="tag">en ligne</span><?php endif; ?>
                <?php if ($a['phone'] !== null): ?><br><a href="tel:<?= $e($a['phone']) ?>" class="small"><?= $e($a['phone']) ?></a><?php endif; ?>
                <?php if ($a['email'] !== null): ?><br><span class="small muted"><?= $e($a['email']) ?></span><?php endif; ?>
                <?php if ($cb !== null): ?><br><a class="small" href="/app.php?m=clientbloom&amp;p=customer&amp;id=<?= $cb['id'] ?>">Fidélité : <?= $e(Money::format($cb['balance_cents'], 'MUR')) ?></a><?php endif; ?>
                <?php if ($a['note'] !== null): ?><br><span class="small muted">« <?= $e($a['note']) ?> »</span><?php endif; ?>
              </td>
              <td><span class="status status--rv-<?= $e($st) ?>"><?= $e(Booking::STATUS_LABELS[$st] ?? $st) ?></span></td>
              <td class="num">
                <?php if ($st === 'booked'): ?>
                  <button type="button" class="btn-link" data-rv-status="done" data-id="<?= (int) $a['id'] ?>">Honoré</button>
                  <button type="button" class="btn-link" data-rv-status="no_show" data-id="<?= (int) $a['id'] ?>">Absent</button>
                  <button type="button" class="btn-link" data-rv-status="cancelled" data-id="<?= (int) $a['id'] ?>">Annuler</button>
                <?php elseif ($st !== 'cancelled'): ?>
                  <button type="button" class="btn-link" data-rv-status="booked" data-id="<?= (int) $a['id'] ?>">Rétablir</button>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>

<section class="card">
  <details<?= $appointments === [] ? ' open' : '' ?>>
    <summary><strong>Nouveau rendez-vous</strong></summary>
    <?php if ($services === [] || $staff === []): ?>
      <p class="muted">Ajoutez d'abord <?= $services === [] ? '<a href="/app.php?m=rendezvous&amp;p=services">une prestation</a>' : '' ?>
        <?= $services === [] && $staff === [] ? 'et ' : '' ?><?= $staff === [] ? '<a href="/app.php?m=rendezvous&amp;p=staff">un membre de l\'équipe</a>' : '' ?>.</p>
    <?php else: ?>
      <form id="rv-book-form" novalidate>
        <div class="form-grid">
          <div class="field"><label for="b-service">Prestation</label>
            <select id="b-service" name="service_id">
              <?php foreach ($services as $s): ?><option value="<?= (int) $s['id'] ?>"><?= $e($s['name']) ?> (<?= (int) $s['duration_min'] ?> min)</option><?php endforeach; ?>
            </select></div>
          <div class="field"><label for="b-staff">Avec</label>
            <select id="b-staff" name="staff_id">
              <?php foreach ($staff as $s): ?><option value="<?= (int) $s['id'] ?>"><?= $e($s['name']) ?></option><?php endforeach; ?>
            </select></div>
          <div class="field"><label for="b-date">Date</label><input type="date" id="b-date" name="date" value="<?= $e($date) ?>" required></div>
          <div class="field"><label for="b-time">Heure</label><input type="time" id="b-time" name="time" step="300" required></div>
          <div class="field"><label for="b-name">Client</label><input type="text" id="b-name" name="name" maxlength="120" required></div>
          <div class="field"><label for="b-phone">Téléphone</label><input type="tel" id="b-phone" name="phone" maxlength="40"></div>
          <div class="field"><label for="b-email">E-mail (confirmation envoyée)</label><input type="email" id="b-email" name="email" maxlength="254"></div>
        </div>
        <div class="field"><label for="b-note">Note</label><input type="text" id="b-note" name="note" maxlength="500"></div>
        <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer le rendez-vous</button></div>
      </form>
    <?php endif; ?>
  </details>
</section>
