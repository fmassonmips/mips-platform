<?php
/**
 * Task detail: fields, time spent (billable once), ticket link.
 *
 * @var callable $e
 * @var array<string,mixed> $task
 * @var list<array<string,mixed>> $time
 * @var list<array<string,mixed>> $projects
 * @var array<int,string> $members
 */
use App\Format;
use App\RendezVous\Booking;
use App\TeamNest\Tasks;

$tid = (int) $task['id'];
?>
<section class="card">
  <p class="small muted"><a href="/app.php?m=teamnest&amp;p=project&amp;id=<?= (int) $task['project_id'] ?>">← <?= $e($task['project_name']) ?></a>
    <?php if ($task['flowdesk_ticket_id'] !== null && $task['ticket_number'] !== null): ?>
      · créée depuis le <a href="/app.php?m=flowdesk&amp;p=ticket&amp;id=<?= (int) $task['flowdesk_ticket_id'] ?>">ticket #<?= (int) $task['ticket_number'] ?></a><?php endif; ?></p>
  <form id="tn-task-form" novalidate data-id="<?= $tid ?>">
    <div class="field"><label for="t-title">Tâche</label><input type="text" id="t-title" name="title" maxlength="200" value="<?= $e($task['title']) ?>" required></div>
    <div class="form-grid">
      <div class="field"><label for="t-status">Statut</label>
        <select id="t-status" name="status"><?php foreach (Tasks::STATUSES as $k => $l): ?><option value="<?= $e($k) ?>"<?= $task['status'] === $k ? ' selected' : '' ?>><?= $e($l) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="t-assignee">Assignée à</label>
        <select id="t-assignee" name="assignee_id"><option value="0">Personne</option>
          <?php foreach ($members as $uid => $name): ?><option value="<?= (int) $uid ?>"<?= (int) $task['assignee_id'] === $uid ? ' selected' : '' ?>><?= $e($name) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="t-due">Échéance</label><input type="date" id="t-due" name="due_date" value="<?= $e($task['due_date'] ?? '') ?>"></div>
      <div class="field"><label for="t-priority">Priorité</label>
        <select id="t-priority" name="priority"><?php foreach (Tasks::PRIORITIES as $k => $l): ?><option value="<?= $e($k) ?>"<?= $task['priority'] === $k ? ' selected' : '' ?>><?= $e($l) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="t-project">Projet</label>
        <select id="t-project" name="project_id"><?php foreach ($projects as $p): ?><option value="<?= (int) $p['id'] ?>"<?= (int) $task['project_id'] === (int) $p['id'] ? ' selected' : '' ?>><?= $e($p['name']) ?></option><?php endforeach; ?></select></div>
    </div>
    <div class="field"><label for="t-desc">Description</label><textarea id="t-desc" name="description" rows="5" maxlength="10000"><?= $e($task['description'] ?? '') ?></textarea></div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer</button>
      <span id="tn-saved" class="success" role="status" hidden>Enregistré.</span>
      <button type="button" class="btn-link danger" data-tn-delete="<?= $tid ?>" data-project="<?= (int) $task['project_id'] ?>">Supprimer la tâche</button>
    </div>
  </form>
</section>

<section class="card">
  <h3>Temps passé · <?= $e(Tasks::formatMinutes((int) $task['minutes'])) ?></h3>
  <form id="tn-time-form" class="inline-form" novalidate data-task="<?= $tid ?>">
    <div class="field"><label for="tm-d">Durée</label><input type="text" id="tm-d" name="duration" maxlength="10" placeholder="1h30" required></div>
    <div class="field"><label for="tm-date">Jour</label><input type="date" id="tm-date" name="date" value="<?= $e(Booking::now()->format('Y-m-d')) ?>" max="<?= $e(Booking::now()->format('Y-m-d')) ?>"></div>
    <div class="field grow"><label for="tm-note">Note</label><input type="text" id="tm-note" name="note" maxlength="200"></div>
    <button type="submit" class="btn-secondary">Ajouter</button>
  </form>
  <?php if ($time !== []): ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Jour</th><th>Qui</th><th class="num">Durée</th><th>Note</th><th>Facture</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($time as $tm): ?>
          <tr>
            <td><?= $e(Format::date((string) $tm['spent_on'])) ?></td>
            <td><?= $e($tm['user_name'] ?? '—') ?></td>
            <td class="num"><?= $e(Tasks::formatMinutes((int) $tm['minutes'])) ?></td>
            <td><?= $e($tm['note'] ?? '') ?></td>
            <td><?php if ($tm['billed_invoice_id'] !== null): ?><a href="/app.php?m=facturo&amp;p=edit&amp;id=<?= (int) $tm['billed_invoice_id'] ?>"><?= $e($tm['invoice_number'] ?? 'brouillon') ?></a><?php else: ?><span class="muted">non facturé</span><?php endif; ?></td>
            <td class="num"><?php if ($tm['billed_invoice_id'] === null): ?><button type="button" class="btn-link" data-tn-del-time="<?= (int) $tm['id'] ?>">Supprimer</button><?php endif; ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
