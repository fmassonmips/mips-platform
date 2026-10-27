<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $staff  each with 'hours' => weekday => "08:00-12:00, 13:00-17:00"
 * @var bool $can_manage
 */
use App\RendezVous\Staff;
?>
<?php if ($can_manage): ?>
<section class="card">
  <h2 id="staff-form-title">Nouveau membre de l'équipe</h2>
  <p class="muted small">Une personne, un fauteuil ou une salle : chacun a son propre agenda. Horaires par jour, plusieurs plages
     séparées par une virgule (ex. « 08:00-12:00, 13:00-17:00 ») ; vide = fermé.</p>
  <form id="staff-form" novalidate data-id="0">
    <div class="form-grid">
      <div class="field"><label for="st-name">Nom</label><input type="text" id="st-name" name="name" maxlength="120" required></div>
    </div>
    <div class="hours-grid">
      <?php foreach (Staff::WEEKDAYS as $d => $label): ?>
        <div class="field"><label for="st-h<?= $d ?>"><?= $e($label) ?></label>
          <input type="text" id="st-h<?= $d ?>" name="h<?= $d ?>" maxlength="200" placeholder="fermé"
                 value="<?= $d <= 5 ? '08:30-12:30, 13:30-17:00' : ($d === 6 ? '08:30-12:30' : '') ?>"></div>
      <?php endforeach; ?>
    </div>
    <label class="checkbox"><input type="checkbox" name="active" checked> Prend des rendez-vous</label>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer</button>
      <button type="reset" class="btn-link">Annuler</button>
    </div>
  </form>
</section>
<?php endif; ?>

<section class="card">
  <h2>Équipe</h2>
  <?php if ($staff === []): ?>
    <p class="muted">Personne pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nom</th><th>Horaires</th><th>Statut</th><?php if ($can_manage): ?><th></th><?php endif; ?></tr></thead>
        <tbody>
          <?php foreach ($staff as $s): ?>
            <tr>
              <td><?= $e($s['name']) ?></td>
              <td class="small">
                <?php foreach (Staff::WEEKDAYS as $d => $label): if ($s['hours'][$d] === '') { continue; } ?>
                  <div><span class="muted"><?= $e(mb_substr($label, 0, 3)) ?></span> <?= $e($s['hours'][$d]) ?></div>
                <?php endforeach; ?>
              </td>
              <td><?= (int) $s['active'] === 1 ? 'Actif' : '<span class="muted">Inactif</span>' ?></td>
              <?php if ($can_manage): ?>
                <td class="num"><button type="button" class="btn-link" data-edit-staff="<?= $e(json_encode([
                    'id' => (int) $s['id'], 'name' => $s['name'], 'active' => (int) $s['active'] === 1, 'hours' => $s['hours'],
                ], JSON_UNESCAPED_UNICODE)) ?>">Modifier</button></td>
              <?php endif; ?>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
