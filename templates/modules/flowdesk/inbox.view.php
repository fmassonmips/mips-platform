<?php
/**
 * @var callable $e
 * @var string $filter
 * @var string $q
 * @var list<array<string,mixed>> $tickets
 * @var array<string,int> $counts
 */
use App\FlowDesk\Tickets;
use App\Format;
use App\RendezVous\Booking;

$now = Booking::now();
$age = static function (string $at) use ($now): string {
    $mins = intdiv(max(0, $now->getTimestamp() - (new DateTimeImmutable($at, $now->getTimezone()))->getTimestamp()), 60);
    return $mins < 60 ? $mins . ' min' : ($mins < 1440 ? intdiv($mins, 60) . ' h' : intdiv($mins, 1440) . ' j');
};
?>
<section class="card">
  <div class="card-head">
    <nav class="filter-tabs" aria-label="Filtres">
      <?php foreach (Tickets::FILTERS as $key => $label): ?>
        <a href="/app.php?m=flowdesk&amp;f=<?= $e($key) ?>"<?= $q === '' && $filter === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?> <span class="count"><?= (int) $counts[$key] ?></span></a>
      <?php endforeach; ?>
    </nav>
    <form class="inline-form" method="get" action="/app.php" role="search">
      <input type="hidden" name="m" value="flowdesk">
      <input type="text" name="q" value="<?= $e($q) ?>" placeholder="N°, sujet, client, e-mail…" aria-label="Rechercher un ticket">
    </form>
  </div>

  <?php if ($tickets === []): ?>
    <p class="muted"><?= $q !== '' ? 'Aucun ticket ne correspond.' : ($filter === 'todo' ? 'Rien à traiter.' : 'Aucun ticket.') ?></p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table tickets">
        <thead><tr><th>N°</th><th>Sujet</th><th>Client</th><th>Priorité</th><th>Statut</th><th>Assigné à</th><th class="num">Dernière activité</th></tr></thead>
        <tbody>
          <?php foreach ($tickets as $tk): $waiting = $tk['status'] === 'open'; ?>
            <tr>
              <td>#<?= (int) $tk['number'] ?></td>
              <td><a href="/app.php?m=flowdesk&amp;p=ticket&amp;id=<?= (int) $tk['id'] ?>"><?= $e($tk['subject']) ?></a>
                <?php if ($tk['source'] === 'formelio'): ?> <span class="tag">Formelio</span><?php endif; ?>
                <?php if ($tk['first_response_at'] === null && $waiting): ?> <span class="tag tag--warn">sans réponse</span><?php endif; ?></td>
              <td><?= $e($tk['customer_name']) ?></td>
              <td><span class="prio prio--<?= $e($tk['priority']) ?>"><?= $e(Tickets::PRIORITIES[$tk['priority']]) ?></span></td>
              <td><span class="status status--fd-<?= $e($tk['status']) ?>"><?= $e(Tickets::STATUSES[$tk['status']]) ?></span></td>
              <td><?= $tk['assignee_name'] !== null ? $e($tk['assignee_name']) : '<span class="muted">—</span>' ?></td>
              <td class="num" title="<?= $e(Format::dateTime((string) $tk['updated_at'])) ?>"><?= $e($age((string) $tk['updated_at'])) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <p class="muted small">Classés par priorité, puis du plus ancien au plus récent : le haut de la liste attend depuis le plus longtemps.</p>
  <?php endif; ?>
</section>
