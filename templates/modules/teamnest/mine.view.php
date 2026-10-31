<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $tasks
 */
use App\Format;
use App\RendezVous\Booking;
use App\TeamNest\Tasks;

$today = Booking::now()->format('Y-m-d');
?>
<section class="card">
  <h2>Mes tâches</h2>
  <?php if ($tasks === []): ?>
    <p class="muted">Aucune tâche ouverte ne vous est assignée.</p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Tâche</th><th>Projet</th><th>Statut</th><th>Échéance</th></tr></thead>
      <tbody>
        <?php foreach ($tasks as $t): $late = $t['due_date'] !== null && $t['due_date'] < $today; ?>
          <tr>
            <td><a href="/app.php?m=teamnest&amp;p=task&amp;id=<?= (int) $t['id'] ?>"><?= $e($t['title']) ?></a><?= $t['priority'] === 'high' ? ' <span class="tag tag--warn">haute</span>' : '' ?></td>
            <td><?= $e($t['project_name']) ?></td>
            <td><?= $e(Tasks::STATUSES[$t['status']]) ?></td>
            <td class="<?= $late ? 'text-danger' : '' ?>"><?= $t['due_date'] !== null ? $e(Format::date((string) $t['due_date'])) . ($late ? ' · en retard' : '') : '—' ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
