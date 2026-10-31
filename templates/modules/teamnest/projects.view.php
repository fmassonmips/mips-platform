<?php
/**
 * @var callable $e
 * @var bool $archived
 * @var list<array<string,mixed>> $projects
 * @var list<array<string,mixed>> $clients
 * @var bool $facturo
 */
use App\Facturo\Money;
use App\TeamNest\Tasks;
?>
<?php if (!$archived): ?>
<section class="card">
  <details<?= $projects === [] ? ' open' : '' ?>>
    <summary><strong>Nouveau projet</strong></summary>
    <form id="tn-project-form" novalidate data-id="0">
      <div class="form-grid">
        <div class="field"><label for="p-name">Nom</label><input type="text" id="p-name" name="name" maxlength="150" required></div>
        <?php if ($facturo): ?>
          <div class="field"><label for="p-client">Client facturé (Facturo)</label>
            <select id="p-client" name="client_id"><option value="0">Aucun (projet interne)</option>
              <?php foreach ($clients as $c): ?><option value="<?= (int) $c['id'] ?>"><?= $e($c['name']) ?></option><?php endforeach; ?></select></div>
          <div class="field"><label for="p-rate">Taux horaire HT (Rs)</label><input type="text" id="p-rate" name="hourly_rate" inputmode="decimal" maxlength="15"></div>
        <?php endif; ?>
      </div>
      <div class="field"><label for="p-desc">Description</label><textarea id="p-desc" name="description" rows="2" maxlength="2000"></textarea></div>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Créer le projet</button></div>
    </form>
  </details>
</section>
<?php endif; ?>

<section class="card">
  <div class="card-head">
    <h2><?= $archived ? 'Projets archivés' : 'Projets' ?></h2>
    <a class="btn-link" href="/app.php?m=teamnest<?= $archived ? '' : '&amp;archived=1' ?>"><?= $archived ? '← Projets en cours' : 'Projets archivés' ?></a>
  </div>
  <?php if ($projects === []): ?>
    <p class="muted"><?= $archived ? 'Aucun projet archivé.' : 'Aucun projet pour l\'instant.' ?></p>
  <?php else: ?>
    <div class="project-cards">
      <?php foreach ($projects as $p): $total = (int) $p['open_tasks'] + (int) $p['done_tasks']; ?>
        <a class="project-card" href="/app.php?m=teamnest&amp;p=project&amp;id=<?= (int) $p['id'] ?>">
          <strong><?= $e($p['name']) ?></strong>
          <span class="small muted"><?= $p['client_name'] !== null ? $e($p['client_name']) : 'Projet interne' ?></span>
          <progress max="<?= max(1, $total) ?>" value="<?= (int) $p['done_tasks'] ?>" aria-label="Avancement"></progress>
          <span class="small"><?= (int) $p['done_tasks'] ?> / <?= $total ?> tâche(s) faite(s)
            <?php if ((int) $p['overdue'] > 0): ?> · <span class="text-danger"><?= (int) $p['overdue'] ?> en retard</span><?php endif; ?></span>
          <?php if ((int) $p['unbilled_min'] > 0): ?>
            <span class="small muted"><?= $e(Tasks::formatMinutes((int) $p['unbilled_min'])) ?> non facturées
              <?= $p['hourly_rate_cents'] !== null ? '· ' . $e(Money::format((int) round((int) $p['unbilled_min'] * (int) $p['hourly_rate_cents'] / 60), 'MUR')) . ' HT' : '' ?></span>
          <?php endif; ?>
        </a>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>
