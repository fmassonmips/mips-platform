<?php
/**
 * Project board: three columns, quick add, project settings and billing.
 *
 * @var callable $e
 * @var array<string,mixed> $project
 * @var array<string,list<array<string,mixed>>> $board
 * @var list<array<string,mixed>> $clients
 * @var array<int,string> $members
 * @var bool $facturo
 * @var bool $can_manage
 * @var int $userId
 */
use App\Facturo\Money;
use App\Format;
use App\RendezVous\Booking;
use App\TeamNest\Tasks;

$pid      = (int) $project['id'];
$today    = Booking::now()->format('Y-m-d');
$statuses = array_keys(Tasks::STATUSES);
?>
<section class="card">
  <div class="card-head">
    <div>
      <h2><?= $e($project['name']) ?><?= $project['status'] === 'archived' ? ' <span class="tag">archivé</span>' : '' ?></h2>
      <p class="small muted"><?= $project['client_name'] !== null ? 'Client : ' . $e($project['client_name']) : 'Projet interne' ?>
        <?= $project['hourly_rate_cents'] !== null ? ' · ' . $e(Money::format((int) $project['hourly_rate_cents'], 'MUR')) . ' HT / heure' : '' ?></p>
    </div>
    <?php if ($facturo && $can_manage && (int) $project['unbilled_min'] > 0 && $project['client_id'] !== null && $project['hourly_rate_cents'] !== null): ?>
      <div class="actions"><button type="button" class="btn-primary btn-inline" id="tn-bill" data-id="<?= $pid ?>">Facturer <?= $e(Tasks::formatMinutes((int) $project['unbilled_min'])) ?></button></div>
    <?php endif; ?>
  </div>
  <?php if (!empty($project['description'])): ?><p class="pre"><?= $e($project['description']) ?></p><?php endif; ?>
  <form id="tn-quick" class="inline-form" novalidate data-project="<?= $pid ?>">
    <div class="field grow"><label for="q-title">Nouvelle tâche</label><input type="text" id="q-title" name="title" maxlength="200" placeholder="Que faut-il faire ?"></div>
    <div class="field"><label for="q-assignee">Pour</label>
      <select id="q-assignee" name="assignee_id"><option value="0">Personne</option>
        <?php foreach ($members as $uid => $name): ?><option value="<?= (int) $uid ?>"<?= $uid === $userId ? ' selected' : '' ?>><?= $e($name) ?></option><?php endforeach; ?></select></div>
    <div class="field"><label for="q-due">Échéance</label><input type="date" id="q-due" name="due_date"></div>
    <button type="submit" class="btn-secondary">Ajouter</button>
  </form>
</section>

<div class="board">
  <?php foreach (Tasks::STATUSES as $st => $label): $i = array_search($st, $statuses, true); ?>
    <section class="card board-col" aria-label="<?= $e($label) ?>">
      <h3><?= $e($label) ?> <span class="count muted"><?= count($board[$st]) ?></span></h3>
      <?php if ($board[$st] === []): ?><p class="muted small">—</p><?php endif; ?>
      <ul class="cards">
        <?php foreach ($board[$st] as $t): $late = $t['status'] !== 'done' && $t['due_date'] !== null && $t['due_date'] < $today; ?>
          <li class="task-card<?= $t['priority'] === 'high' ? ' is-high' : '' ?>">
            <a href="/app.php?m=teamnest&amp;p=task&amp;id=<?= (int) $t['id'] ?>"><?= $e($t['title']) ?></a>
            <div class="small muted">
              <?= $t['assignee_name'] !== null ? $e($t['assignee_name']) : 'Non assignée' ?>
              <?php if ($t['due_date'] !== null): ?> · <span class="<?= $late ? 'text-danger' : '' ?>"><?= $e(Format::date((string) $t['due_date'])) ?></span><?php endif; ?>
              <?php if ((int) $t['minutes'] > 0): ?> · <?= $e(Tasks::formatMinutes((int) $t['minutes'])) ?><?php endif; ?>
              <?php if ($t['ticket_number'] !== null): ?> · <span class="tag">ticket #<?= (int) $t['ticket_number'] ?></span><?php endif; ?>
            </div>
            <div class="move">
              <?php if ($i > 0): ?><button type="button" class="btn-link" data-tn-move="<?= $e($statuses[$i - 1]) ?>" data-id="<?= (int) $t['id'] ?>" aria-label="Vers <?= $e(Tasks::STATUSES[$statuses[$i - 1]]) ?>">← <?= $e(Tasks::STATUSES[$statuses[$i - 1]]) ?></button><?php endif; ?>
              <?php if ($i < 2): ?><button type="button" class="btn-link" data-tn-move="<?= $e($statuses[$i + 1]) ?>" data-id="<?= (int) $t['id'] ?>" aria-label="Vers <?= $e(Tasks::STATUSES[$statuses[$i + 1]]) ?>"><?= $e(Tasks::STATUSES[$statuses[$i + 1]]) ?> →</button><?php endif; ?>
            </div>
          </li>
        <?php endforeach; ?>
      </ul>
    </section>
  <?php endforeach; ?>
</div>

<section class="card">
  <details>
    <summary><strong>Paramètres du projet</strong></summary>
    <form id="tn-project-form" novalidate data-id="<?= $pid ?>">
      <div class="form-grid">
        <div class="field"><label for="p-name">Nom</label><input type="text" id="p-name" name="name" maxlength="150" value="<?= $e($project['name']) ?>" required></div>
        <?php if ($facturo): ?>
          <div class="field"><label for="p-client">Client facturé (Facturo)</label>
            <select id="p-client" name="client_id"><option value="0">Aucun (projet interne)</option>
              <?php foreach ($clients as $c): ?><option value="<?= (int) $c['id'] ?>"<?= (int) $project['client_id'] === (int) $c['id'] ? ' selected' : '' ?>><?= $e($c['name']) ?></option><?php endforeach; ?></select></div>
          <div class="field"><label for="p-rate">Taux horaire HT (Rs)</label><input type="text" id="p-rate" name="hourly_rate" inputmode="decimal" maxlength="15"
            value="<?= $project['hourly_rate_cents'] !== null ? $e(Money::toInput((int) $project['hourly_rate_cents'])) : '' ?>"></div>
        <?php endif; ?>
      </div>
      <div class="field"><label for="p-desc">Description</label><textarea id="p-desc" name="description" rows="2" maxlength="2000"><?= $e($project['description'] ?? '') ?></textarea></div>
      <div class="actions">
        <button type="submit" class="btn-primary btn-inline">Enregistrer</button>
        <button type="button" class="btn-link" data-tn-archive="<?= $project['status'] === 'archived' ? '0' : '1' ?>" data-id="<?= $pid ?>"><?= $project['status'] === 'archived' ? 'Réactiver le projet' : 'Archiver le projet' ?></button>
      </div>
    </form>
  </details>
</section>
