<?php
/**
 * @var callable $e
 * @var int $year
 * @var list<array<string,mixed>> $balances
 * @var list<array<string,mixed>> $requests
 * @var list<array<string,mixed>> $types
 * @var callable $calendar_data
 * @var int $userId
 */
use App\Format;
use App\StaffZen\Leaves;

$today = Leaves::today();
?>
<section class="card">
  <h2>Mes soldes <?= $year ?></h2>
  <div class="kpis">
    <?php foreach ($balances as $b): ?>
      <div class="kpi">
        <span class="kpi-label"><?= $e($b['name']) ?></span>
        <?php if ($b['counted']): ?>
          <strong class="kpi-value<?= $b['remaining'] < 0 ? ' text-danger' : '' ?>"><?= $e(Leaves::days((int) $b['remaining'])) ?></strong>
          <span class="kpi-sub small muted">restants sur <?= $e(Leaves::days((int) $b['allowance'])) ?> · pris <?= $e(Leaves::days($b['taken'])) ?><?= $b['pending'] > 0 ? ' · en attente ' . $e(Leaves::days($b['pending'])) : '' ?></span>
        <?php else: ?>
          <strong class="kpi-value"><?= $e(Leaves::days($b['taken'])) ?></strong>
          <span class="kpi-sub small muted">pris (non décompté)<?= $b['pending'] > 0 ? ' · en attente ' . $e(Leaves::days($b['pending'])) : '' ?></span>
        <?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
</section>

<section class="card">
  <h2>Demander un congé</h2>
  <?php if ($types === []): ?>
    <p class="muted">Aucun type de congé actif : demandez à un responsable de les configurer.</p>
  <?php else: ?>
    <form id="sz-request" class="sz-leave-form" novalidate data-cal="<?= $calendar_data() ?>">
      <?php $prefix = 'rq'; require __DIR__ . '/request-fields.partial.php'; ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Envoyer la demande</button></div>
    </form>
  <?php endif; ?>
</section>

<section class="card">
  <h2>Mes demandes</h2>
  <?php if ($requests === []): ?>
    <p class="muted">Aucune demande pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Période</th><th>Type</th><th class="num">Jours</th><th>Statut</th><th>Réponse</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($requests as $r): $canCancel = $r['status'] === 'pending' || ($r['status'] === 'approved' && $r['start_date'] > $today); ?>
          <tr>
            <td class="nowrap"><?= $e(Leaves::period((string) $r['start_date'], (string) $r['end_date'], $r['half_day'])) ?></td>
            <td><?= $e($r['type_name']) ?></td>
            <td class="num"><?= $e(Leaves::days((int) $r['halfdays'])) ?></td>
            <td><span class="status status--sz-<?= $e($r['status']) ?>"><?= $e(Leaves::STATUSES[$r['status']]) ?></span></td>
            <td class="small"><?php if ($r['decided_by_name'] !== null && $r['status'] !== 'pending'): ?><?= $e($r['decided_by_name']) ?>, <?= $e(Format::date((string) $r['decided_at'])) ?><?= $r['decision_note'] !== null ? ' — « ' . $e($r['decision_note']) . ' »' : '' ?><?php endif; ?></td>
            <td class="num"><?php if ($canCancel): ?><button type="button" class="btn-link danger" data-sz-cancel="<?= (int) $r['id'] ?>">Annuler</button><?php endif; ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
