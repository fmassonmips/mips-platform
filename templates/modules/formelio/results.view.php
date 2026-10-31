<?php
/**
 * Summary per question, then every response.
 *
 * @var callable $e
 * @var array<string,mixed> $form
 * @var list<array<string,mixed>> $responses
 * @var list<array<string,mixed>> $summary
 * @var bool $can_manage
 */
use App\Format;
use App\Formelio\Responses;

$n   = count($responses);
$pct = static fn (int $part, int $total): int => $total > 0 ? (int) round(100 * $part / $total) : 0;
?>
<section class="card">
  <div class="card-head">
    <h2><?= $e($form['title']) ?> · <?= $n ?> réponse<?= $n > 1 ? 's' : '' ?></h2>
    <?php if ($can_manage && $n > 0): ?>
      <div class="actions"><a class="btn-secondary" href="/formelio/export.php?id=<?= (int) $form['id'] ?>">Exporter (CSV)</a></div>
    <?php endif; ?>
  </div>
  <?php if ($n === 0): ?>
    <p class="muted">Pas encore de réponse<?= $form['status'] !== 'open' ? ' : le formulaire n\'est pas ouvert.' : '.' ?></p>
  <?php endif; ?>
</section>

<?php if ($n > 0): foreach ($summary as $s): $f = $s['field']; ?>
  <section class="card">
    <h3><?= $e($f['label']) ?></h3>
    <p class="muted small"><?= (int) $s['answered'] ?> réponse<?= $s['answered'] > 1 ? 's' : '' ?> sur <?= $n ?></p>
    <?php if (isset($s['counts']) && $f['type'] !== 'rating'): ?>
      <?php foreach ($s['counts'] as $label => $c): ?>
        <div class="bar-row"><span class="bar-label"><?= $e($label) ?></span>
          <meter min="0" max="<?= max(1, $s['answered']) ?>" value="<?= (int) $c ?>"></meter>
          <span class="bar-value"><?= (int) $c ?> · <?= $pct((int) $c, (int) $s['answered']) ?> %</span></div>
      <?php endforeach; ?>
    <?php elseif ($f['type'] === 'rating'): ?>
      <p class="big-figure"><?= $s['average'] !== null ? $e(number_format($s['average'], 1, ',', ' ')) : '—' ?> <span class="muted small">/ 5</span></p>
      <?php foreach (array_reverse($s['counts'], true) as $star => $c): ?>
        <div class="bar-row"><span class="bar-label"><?= (int) $star ?> ★</span>
          <meter min="0" max="<?= max(1, $s['answered']) ?>" value="<?= (int) $c ?>"></meter>
          <span class="bar-value"><?= (int) $c ?></span></div>
      <?php endforeach; ?>
    <?php elseif ($f['type'] === 'nps'): ?>
      <p class="big-figure"><?= $s['nps'] !== null ? ($s['nps'] > 0 ? '+' : '') . (int) $s['nps'] : '—' ?> <span class="muted small">score NPS (−100 à +100)</span></p>
      <p class="small">Promoteurs (9-10) : <strong><?= (int) $s['promoters'] ?></strong> · Neutres (7-8) : <?= (int) $s['passives'] ?> · Détracteurs (0-6) : <strong><?= (int) $s['detractors'] ?></strong></p>
    <?php elseif ($f['type'] === 'number'): ?>
      <p>Moyenne : <strong><?= $s['average'] !== null ? $e(number_format($s['average'], 1, ',', ' ')) : '—' ?></strong> · Total : <?= $e(rtrim(rtrim(number_format($s['total'], 2, ',', ' '), '0'), ',')) ?></p>
    <?php elseif (!empty($s['latest'])): ?>
      <ul class="latest"><?php foreach ($s['latest'] as $v): ?><li class="pre"><?= $e(Responses::display($v)) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </section>
<?php endforeach; endif; ?>

<?php if ($n > 0): ?>
<section class="card">
  <h2>Toutes les réponses</h2>
  <?php foreach ($responses as $r): ?>
    <details class="response">
      <summary><strong><?= $e(Format::dateTime((string) $r['created_at'])) ?></strong>
        <?php if (!empty($r['source']) && str_starts_with((string) $r['source'], 'rendezvous:')): ?><span class="tag">après un rendez-vous</span><?php endif; ?>
        <span class="muted small"><?= $e(mb_strimwidth(implode(' · ', array_filter(array_map(static fn ($a) => Responses::display($a['value']), $r['answers']), 'strlen')), 0, 90, '…')) ?></span></summary>
      <dl class="answers">
        <?php foreach ($r['answers'] as $a): ?>
          <dt><?= $e($a['label']) ?></dt><dd class="pre"><?= Responses::display($a['value']) !== '' ? $e(Responses::display($a['value'])) : '<span class="muted">—</span>' ?></dd>
        <?php endforeach; ?>
      </dl>
      <?php if ($can_manage): ?><button type="button" class="btn-link danger" data-fm-delete-response="<?= (int) $r['id'] ?>">Supprimer cette réponse</button><?php endif; ?>
    </details>
  <?php endforeach; ?>
</section>
<?php endif; ?>
