<?php
/**
 * Back-office company page: usage over the last 30 days, two bar charts on
 * the same days (members active, records created), drawn as inline SVG.
 *
 * @var callable $e
 * @var list<array{day:string,users:int,records:int}> $usage
 * @var list<array<string,mixed>> $members
 */
$activeDays = count(array_filter($usage, static fn (array $d): bool => $d['users'] > 0));
$records    = array_sum(array_column($usage, 'records'));
$active7    = count(array_filter($members, static fn (array $m): bool => (int) $m['active_days_7'] > 0));
$n          = count($usage);
$chart = static function (string $key, string $label, string $class) use ($usage, $n, $e): string {
    $max = max(1, ...array_column($usage, $key));
    $w = 600; $h = 70; $gap = 2; $bw = $w / $n - $gap;
    $svg = '<svg class="bo-chart ' . $class . '" viewBox="0 0 ' . $w . ' ' . ($h + 16) . '" preserveAspectRatio="none" role="img" aria-label="' . $e($label) . '">';
    foreach ($usage as $i => $d) {
        $v  = $d[$key];
        $bh = $v > 0 ? max(2, round($v / $max * $h, 1)) : 0;
        $x  = round($i * ($w / $n), 1);
        $wd = (int) (new \DateTimeImmutable($d['day']))->format('N');
        if ($wd >= 6) {
            $svg .= '<rect class="bo-weekend" x="' . $x . '" y="0" width="' . round($bw + $gap, 1) . '" height="' . $h . '"/>';
        }
        $svg .= '<rect class="bo-bar" x="' . $x . '" y="' . ($h - $bh) . '" width="' . round($bw, 1) . '" height="' . $bh . '"><title>'
              . $e(\App\Format::date($d['day']) . ' : ' . $v) . '</title></rect>';
    }
    $svg .= '<line class="bo-axis" x1="0" y1="' . $h . '" x2="' . $w . '" y2="' . $h . '"/></svg>';
    return '<div class="bo-chart-row"><span class="bo-chart-label">' . $e($label) . ' <span class="muted">(max ' . $max . ')</span></span>' . $svg . '</div>';
};
?>
<section class="card">
  <h2>Utilisation sur 30 jours</h2>
  <div class="kpis bo-usage-kpis">
    <div class="kpi"><span>Jours avec au moins une connexion</span><strong><?= $activeDays ?> / <?= $n ?></strong></div>
    <div class="kpi"><span>Membres actifs sur 7 jours</span><strong><?= $active7 ?> / <?= count($members) ?></strong></div>
    <div class="kpi"><span>Enregistrements créés</span><strong><?= $records ?></strong><small>factures, commandes, réservations…</small></div>
  </div>
  <?= $chart('users', 'Membres connectés par jour', 'bo-chart--users') ?>
  <?= $chart('records', 'Enregistrements créés par jour', 'bo-chart--records') ?>
  <div class="bo-chart-dates small muted">
    <span><?= $e(\App\Format::date($usage[0]['day'])) ?></span><span>week-ends grisés · survolez une barre pour le détail</span><span><?= $e(\App\Format::date($usage[$n - 1]['day'])) ?></span>
  </div>
</section>
