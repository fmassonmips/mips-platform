<?php
/**
 * @var callable $e
 * @var int $year
 * @var array{work_days:string} $settings
 * @var list<array<string,mixed>> $all_types
 * @var array<string,string> $holidays
 */
use App\Format;
use App\StaffZen\Leaves;

$days  = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
// Fixed-date public holidays of Mauritius; movable ones (Cavadee, Maha Shivaratree, Ugadi, Eid, Ganesh Chaturthi,
// Divali, Spring Festival) are set each year by the government and must be added by hand.
$fixed = ['01-01' => 'Nouvel An', '01-02' => 'Lendemain du Nouvel An', '02-01' => 'Abolition de l\'esclavage', '03-12' => 'Fête de l\'Indépendance',
          '05-01' => 'Fête du Travail', '08-15' => 'Assomption', '11-01' => 'Toussaint', '11-02' => 'Arrivée des travailleurs engagés', '12-25' => 'Noël'];
$fixedJson = [];
foreach ($fixed as $md => $name) {
    $fixedJson[] = ['day' => $year . '-' . $md, 'name' => $name];
}
?>
<section class="card">
  <h2>Jours travaillés</h2>
  <form id="sz-workdays" novalidate>
    <div class="sz-days">
      <?php foreach ($days as $i => $d): ?><label class="checkbox"><input type="checkbox" value="<?= $i ?>"<?= $settings['work_days'][$i] === '1' ? ' checked' : '' ?>> <?= $e($d) ?></label><?php endforeach; ?>
    </div>
    <p class="small muted">Seuls ces jours sont décomptés d'un congé. Un changement ne recalcule pas les demandes déjà faites.</p>
    <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer</button></div>
  </form>
</section>

<section class="card">
  <h2>Types de congé</h2>
  <p class="small muted">Droits proposés par défaut : 20 jours de congé annuel et 15 jours de congé maladie par an, valeurs courantes à Maurice. Vérifiez-les avec vos contrats et la loi (Workers' Rights Act) ; laissez « jours par an » vide pour un congé non décompté.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Nom</th><th>Jours par an <span class="small muted">(vide = non décompté)</span></th><th>Actif</th><th></th></tr></thead>
    <tbody>
      <?php foreach ($all_types as $t): ?>
        <tr data-type-row="<?= $t['id'] ?>">
          <td><input type="text" name="name" maxlength="60" value="<?= $e($t['name']) ?>" aria-label="Nom"></td>
          <td><input type="text" name="days" inputmode="decimal" maxlength="6" class="sz-allow" value="<?= $t['allowance_halfdays'] !== null ? $e(str_replace([' j', ','], ['', '.'], Leaves::days($t['allowance_halfdays']))) : '' ?>" placeholder="—" aria-label="Jours par an"></td>
          <td><input type="checkbox" name="active"<?= $t['active'] ? ' checked' : '' ?> aria-label="Actif"></td>
          <td class="num nowrap"><button type="button" class="btn-secondary" data-save-type="<?= $t['id'] ?>">Enregistrer</button>
            <?php if (!$t['used']): ?><button type="button" class="btn-link danger" data-delete-type="<?= $t['id'] ?>">Supprimer</button><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      <tr data-type-row="0">
        <td><input type="text" name="name" maxlength="60" placeholder="Nouveau type (ex. Congé maternité)" aria-label="Nom du nouveau type"></td>
        <td><input type="text" name="days" inputmode="decimal" maxlength="6" class="sz-allow" placeholder="—" aria-label="Jours par an"></td>
        <td><input type="checkbox" name="active" checked aria-label="Actif"></td>
        <td class="num"><button type="button" class="btn-secondary" data-save-type="0">Ajouter</button></td>
      </tr>
    </tbody>
  </table></div>
</section>

<section class="card">
  <div class="card-head">
    <h2>Jours fériés <?= $year ?></h2>
    <div class="actions">
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=settings&amp;y=<?= $year - 1 ?>" aria-label="Année précédente">‹</a>
      <a class="btn-secondary" href="/app.php?m=staffzen&amp;p=settings&amp;y=<?= $year + 1 ?>" aria-label="Année suivante">›</a>
    </div>
  </div>
  <p class="small muted">Non décomptés des congés. Les fêtes à date fixe s'ajoutent en un clic ; les fêtes mobiles (Cavadee, Maha Shivaratree, Ugadi, Eid-ul-Fitr, Ganesh Chaturthi, Divali, Fête du Printemps) sont fixées chaque année par le gouvernement : ajoutez-les d'après la liste officielle, et vérifiez-la chaque année (elle peut aussi déplacer un férié tombant un dimanche).</p>
  <p><button type="button" class="btn-secondary" id="sz-fixed" data-days="<?= $e(json_encode($fixedJson, JSON_UNESCAPED_UNICODE)) ?>">Ajouter les fériés à date fixe de <?= $year ?></button></p>
  <?php if ($holidays !== []): ?>
    <ul class="sz-holidays">
      <?php foreach ($holidays as $day => $name): ?>
        <li><span><?= $e(Format::date($day)) ?> · <?= $e($name) ?></span> <button type="button" class="btn-link danger" data-del-holiday="<?= $e($day) ?>">Retirer</button></li>
      <?php endforeach; ?>
    </ul>
  <?php else: ?>
    <p class="muted">Aucun jour férié saisi pour <?= $year ?>.</p>
  <?php endif; ?>
  <form id="sz-holiday" class="form-grid" novalidate>
    <div class="field"><label for="h-day">Date</label><input type="date" id="h-day" name="day" required></div>
    <div class="field"><label for="h-name">Nom</label><input type="text" id="h-name" name="name" maxlength="80" required></div>
    <div class="field sz-holiday-btn"><button type="submit" class="btn-secondary">Ajouter</button></div>
  </form>
</section>
