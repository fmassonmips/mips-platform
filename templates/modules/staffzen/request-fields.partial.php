<?php
/**
 * Fields shared by "request leave" and "record an absence".
 *
 * @var callable $e
 * @var list<array{id:int,name:string,allowance_halfdays:?int}> $types
 * @var string $prefix
 */
use App\StaffZen\Leaves;
?>
<div class="form-grid">
  <div class="field"><label for="<?= $prefix ?>-type">Type</label>
    <select id="<?= $prefix ?>-type" name="type_id"><?php foreach ($types as $t): ?><option value="<?= $t['id'] ?>"><?= $e($t['name']) ?></option><?php endforeach; ?></select></div>
  <div class="field"><label for="<?= $prefix ?>-start">Du</label><input type="date" id="<?= $prefix ?>-start" name="start" required></div>
  <div class="field"><label for="<?= $prefix ?>-end">Au (inclus)</label><input type="date" id="<?= $prefix ?>-end" name="end"></div>
  <div class="field" data-half-field><label for="<?= $prefix ?>-half">Durée</label>
    <select id="<?= $prefix ?>-half" name="half"><option value="">Journée entière</option><?php foreach (Leaves::HALVES as $k => $l): ?><option value="<?= $k ?>">Demi-journée (<?= $e($l) ?>)</option><?php endforeach; ?></select></div>
</div>
<div class="field"><label for="<?= $prefix ?>-note">Message (facultatif)</label><input type="text" id="<?= $prefix ?>-note" name="note" maxlength="500"></div>
<p class="small muted" data-count aria-live="polite"></p>
