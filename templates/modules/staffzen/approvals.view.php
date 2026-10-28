<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $pending
 * @var list<array<string,mixed>> $recent
 * @var array<int,string> $members
 * @var list<array<string,mixed>> $types
 * @var callable $calendar_data
 * @var array{id:int,name:string,role:string} $org
 * @var int $userId
 */
use App\Format;
use App\StaffZen\Leaves;

// Balance left after approving, per pending request (counted types only).
$after = [];
foreach ($pending as $r) {
    if ((int) $r['counted'] === 1) {
        foreach (Leaves::balances($org['id'], (int) $r['user_id'], (int) substr((string) $r['start_date'], 0, 4)) as $b) {
            if ($b['type_id'] === (int) $r['type_id']) {
                $after[(int) $r['id']] = $b['remaining']; // pending already reserved
            }
        }
    }
}
?>
<section class="card">
  <h2>À valider</h2>
  <?php if ($pending === []): ?>
    <p class="muted">Aucune demande en attente.</p>
  <?php else: ?>
    <ul class="sz-queue">
      <?php foreach ($pending as $r): $id = (int) $r['id']; $own = (int) $r['user_id'] === $userId && $org['role'] !== 'owner'; ?>
        <li class="sz-queue-item">
          <div>
            <strong><?= $e($r['user_name']) ?></strong> · <?= $e($r['type_name']) ?><br>
            <?= $e(Leaves::period((string) $r['start_date'], (string) $r['end_date'], $r['half_day'])) ?> · <strong><?= $e(Leaves::days((int) $r['halfdays'])) ?></strong>
            <?php if (isset($after[$id])): ?><span class="small muted"> · reste si tout est accordé : <?= $e(Leaves::days($after[$id])) ?></span><?php endif; ?>
            <?php if ($r['note'] !== null): ?><br><span class="small">« <?= $e($r['note']) ?> »</span><?php endif; ?>
            <br><span class="small muted">Demandé le <?= $e(Format::dateTime((string) $r['created_at'])) ?></span>
          </div>
          <?php if ($own): ?>
            <p class="small muted">Votre demande : un autre responsable la valide.</p>
          <?php else: ?>
            <div class="sz-decide">
              <input type="text" maxlength="500" placeholder="Commentaire (facultatif)" aria-label="Commentaire" data-note-for="<?= $id ?>">
              <button type="button" class="btn-primary btn-inline" data-sz-decide="<?= $id ?>" data-approve="1">Accorder</button>
              <button type="button" class="btn-secondary" data-sz-decide="<?= $id ?>" data-approve="0">Refuser</button>
            </div>
          <?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ul>
  <?php endif; ?>
</section>

<section class="card">
  <h2>Enregistrer une absence</h2>
  <p class="small muted">Pour quelqu'un qui n'a pas fait la demande (maladie, absence passée) : l'absence est accordée directement et la personne est prévenue par e-mail.</p>
  <form id="sz-record" class="sz-leave-form" novalidate data-cal="<?= $calendar_data() ?>">
    <div class="field"><label for="rc-user">Personne</label>
      <select id="rc-user" name="user_id"><?php foreach ($members as $uid => $name): ?><option value="<?= $uid ?>"><?= $e($name) ?></option><?php endforeach; ?></select></div>
    <?php $prefix = 'rc'; require __DIR__ . '/request-fields.partial.php'; ?>
    <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
  </form>
</section>

<section class="card">
  <h2>Récemment</h2>
  <?php if ($recent === []): ?>
    <p class="muted">Rien pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Personne</th><th>Période</th><th>Type</th><th class="num">Jours</th><th>Statut</th><th>Par</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($recent as $r): ?>
          <tr>
            <td><?= $e($r['user_name']) ?></td>
            <td class="nowrap"><?= $e(Leaves::period((string) $r['start_date'], (string) $r['end_date'], $r['half_day'])) ?></td>
            <td><?= $e($r['type_name']) ?></td>
            <td class="num"><?= $e(Leaves::days((int) $r['halfdays'])) ?></td>
            <td><span class="status status--sz-<?= $e($r['status']) ?>"><?= $e(Leaves::STATUSES[$r['status']]) ?></span></td>
            <td class="small"><?= $e($r['decided_by_name'] ?? '—') ?><?= $r['decision_note'] !== null ? ' — « ' . $e($r['decision_note']) . ' »' : '' ?></td>
            <td class="num"><?php if ($r['status'] === 'approved'): ?><button type="button" class="btn-link danger" data-sz-cancel="<?= (int) $r['id'] ?>">Annuler</button><?php endif; ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
