<?php
/**
 * BizPilot: the owner's dashboard for one month (?mo=YYYY-MM), compared with
 * the month before, with what needs attention today. Owner/admin only: it
 * shows the company's figures. Each block appears when its app is active.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\BizPilot\Dashboard as D;
use App\Facturo\Money;
use App\RendezVous\Booking;
use App\Suite\Modules;
use App\Suite\Tenant;

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

if (!Tenant::canManage($org)) {
    echo '<section class="card"><h2>BizPilot</h2><p class="muted">Le tableau de bord présente les chiffres de l\'entreprise : il est réservé au propriétaire et aux administrateurs.</p></section>';
    return;
}

$now     = Booking::now();
$month   = is_string($_GET['mo'] ?? null) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $_GET['mo']) ? $_GET['mo'] : $now->format('Y-m');
$start   = new DateTimeImmutable($month . '-01');
$from    = $start->format('Y-m-d');
$to      = $start->modify('+1 month')->format('Y-m-d');
$pFrom   = $start->modify('-1 month')->format('Y-m-d');
$isNow   = $month === $now->format('Y-m');
$months  = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
$label   = static fn (DateTimeImmutable $d): string => $months[(int) $d->format('n')] . ' ' . $d->format('Y');
$short   = static fn (string $ym): string => mb_substr($months[(int) substr($ym, 5, 2)], 0, 4) . '.';

$on = [];
foreach (['facturo', 'rendezvous', 'clientbloom', 'formelio', 'flowdesk', 'teamnest', 'shoplokal', 'staffzen'] as $slug) {
    $on[$slug] = Modules::isEnabled($org['id'], $slug);
}
$rs = static fn (int $c): string => Money::format($c, 'MUR');

// [value shown, delta %, "up is good"?, sub-text]
$tiles = [];
$todo  = [];
if ($on['facturo']) {
    $f  = D::facturo($org['id'], $from, $to);
    $fp = D::facturo($org['id'], $pFrom, $from);
    $rc = D::receivables($org['id']);
    $tiles['Facturation'] = [
        ['Facturé TTC', $rs($f['invoiced_cents']), D::delta($f['invoiced_cents'], $fp['invoiced_cents']), true, $f['invoices'] . ' facture(s), avoirs déduits · HT ' . $rs($f['invoiced_ht_cents'])],
        ['Factures payées', $rs($f['collected_cents']), D::delta($f['collected_cents'], $fp['collected_cents']), true, 'marquées payées ce mois-ci'],
        ['Impayés', $rs($rc['unpaid_cents']), null, false, $rc['unpaid'] . ' facture(s) · dont en retard ' . $rs($rc['overdue_cents'])],
        ['Devis en attente', $rs($rc['waiting_cents']), null, true, $rc['waiting'] . ' devis envoyé(s)' . ($f['quotes_accepted'] + $f['quotes_declined'] > 0
            ? ' · ' . (int) round(100 * $f['quotes_accepted'] / ($f['quotes_accepted'] + $f['quotes_declined'])) . ' % acceptés ce mois' : '')],
    ];
    if ($rc['overdue'] > 0) {
        $todo[] = [$rc['overdue'] . ' facture(s) en retard de paiement : ' . $rs($rc['overdue_cents']), '/app.php?m=facturo&p=invoices', 'danger'];
    }
    if ($rc['stale'] > 0) {
        $todo[] = [$rc['stale'] . ' devis envoyé(s) il y a plus de ' . D::QUOTE_FOLLOW_UP_DAYS . ' jours, sans réponse : à relancer', '/app.php?m=facturo&p=quotes', 'warn'];
    }
    if ($rc['mra_blocked'] > 0) {
        $todo[] = [$rc['mra_blocked'] . ' document(s) pas encore fiscalisé(s) par la MRA', '/app.php?m=facturo&p=invoices', 'danger'];
    }
    $trend = D::trend($org['id'], $month);
    $top   = D::topClients($org['id'], $from, $to);
}
if ($on['rendezvous']) {
    $r  = D::rendezvous($org['id'], $from, $to);
    $rp = D::rendezvous($org['id'], $pFrom, $from);
    $ns  = $r['done'] + $r['no_show'] > 0 ? (int) round(100 * $r['no_show'] / ($r['done'] + $r['no_show'])) : null;
    $nsp = $rp['done'] + $rp['no_show'] > 0 ? (int) round(100 * $rp['no_show'] / ($rp['done'] + $rp['no_show'])) : null;
    $tiles['Rendez-vous'] = [
        ['Rendez-vous', (string) $r['appointments'], D::delta($r['appointments'], $rp['appointments']), true, $r['online'] . ' pris en ligne · ' . $r['cancelled'] . ' annulé(s)'],
        ['Taux d\'absence', $ns !== null ? $ns . ' %' : '—', $ns !== null && $nsp !== null ? $ns - $nsp : null, false, $r['no_show'] . ' absent(s) sur ' . ($r['done'] + $r['no_show']) . ' passés', 'pts'],
        ['Prestations honorées', $rs($r['done_value_cents']), D::delta($r['done_value_cents'], $rp['done_value_cents']), true, $r['done'] . ' rendez-vous, au prix affiché'],
    ];
    if ($isNow && ($today = D::appointmentsToday($org['id'])) > 0) {
        $todo[] = [$today . ' rendez-vous aujourd\'hui', '/app.php?m=rendezvous', 'info'];
    }
}
if ($on['clientbloom']) {
    $c  = D::clientbloom($org['id'], $from, $to);
    $cp = D::clientbloom($org['id'], $pFrom, $from);
    $tiles['Fidélité'] = [
        ['Ventes fidélité', $rs($c['sales_cents']), D::delta($c['sales_cents'], $cp['sales_cents']), true, $c['buyers'] . ' client(s) acheteur(s)'],
        ['Nouveaux clients', (string) $c['new_customers'], D::delta($c['new_customers'], $cp['new_customers']), true, $c['customers'] . ' au total'],
        ['Cashback en circulation', $rs($c['outstanding_cents']), null, null, 'émis ' . $rs($c['issued_cents']) . ' · utilisé ' . $rs($c['redeemed_cents']) . ' ce mois'],
    ];
}
if ($on['formelio']) {
    $fm  = D::formelio($org['id'], $from, $to);
    $fmp = D::formelio($org['id'], $pFrom, $from);
    $tiles['Satisfaction'] = [
        ['Score NPS', $fm['nps'] !== null ? ($fm['nps'] > 0 ? '+' : '') . $fm['nps'] : '—', $fm['nps'] !== null && $fmp['nps'] !== null ? $fm['nps'] - $fmp['nps'] : null, true, $fm['nps_answers'] . ' réponse(s) « recommanderiez-vous »', 'pts'],
        ['Note moyenne', $fm['rating'] !== null ? number_format($fm['rating'], 1, ',', ' ') . ' / 5' : '—', null, true, $fm['rating_answers'] . ' note(s)'],
        ['Réponses aux formulaires', (string) $fm['responses'], D::delta($fm['responses'], $fmp['responses']), true, 'tous formulaires'],
    ];
}
if ($on['flowdesk']) {
    $s  = D::flowdesk($org['id'], $from, $to);
    $sp = D::flowdesk($org['id'], $pFrom, $from);
    $sq = D::supportQueue($org['id']);
    $fr = static fn (?int $m): string => $m === null ? '—' : ($m < 60 ? $m . ' min' : ($m < 1440 ? round($m / 60, 1) . ' h' : round($m / 1440, 1) . ' j'));
    $tiles['Support'] = [
        ['Tickets reçus', (string) $s['created'], D::delta($s['created'], $sp['created']), null, $s['resolved'] . ' résolu(s) ce mois'],
        ['1re réponse en', $fr($s['first_response_min']), D::delta($s['first_response_min'], $sp['first_response_min']), false, 'délai moyen'],
        ['À traiter maintenant', (string) $sq['open'], null, false, $sq['unanswered'] . ' sans aucune réponse'],
    ];
    if ($sq['unanswered'] > 0) {
        $todo[] = [$sq['unanswered'] . ' ticket(s) support sans réponse' . ($sq['urgent'] > 0 ? ' (' . $sq['urgent'] . ' prioritaire(s))' : ''), '/app.php?m=flowdesk', $sq['urgent'] > 0 ? 'danger' : 'warn'];
    }
}
if ($on['shoplokal']) {
    $sh  = \App\ShopLokal\Orders::sales($org['id'], $from, $to);
    $shp = \App\ShopLokal\Orders::sales($org['id'], $pFrom, $from);
    $shc = \App\ShopLokal\Orders::counts($org['id']);
    $tiles['Boutique en ligne'] = [
        ['Commandes', (string) $sh['orders'], D::delta($sh['orders'], $shp['orders']), true, 'hors commandes annulées'],
        ['Ventes TTC', $rs($sh['revenue_cents']), D::delta($sh['revenue_cents'], $shp['revenue_cents']), true, 'dont payées ' . $rs($sh['paid_cents'])],
    ];
    if ($shc['new'] > 0) {
        $todo[] = [$shc['new'] . ' nouvelle(s) commande(s) en ligne à confirmer', '/app.php?m=shoplokal', 'danger'];
    }
    if (($low = \App\ShopLokal\Products::lowStock($org['id'])) !== []) {
        $todo[] = [count($low) . ' produit(s) en stock bas dans la boutique', '/app.php?m=shoplokal&p=products', 'warn'];
    }
}
if ($on['staffzen']) {
    if (($lv = \App\StaffZen\Leaves::pendingCount($org['id'])) > 0) {
        $todo[] = [$lv . ' demande(s) de congé à valider', '/app.php?m=staffzen&p=approvals', 'warn'];
    }
    if ($isNow && ($away = \App\StaffZen\Leaves::awayToday($org['id'])) !== []) {
        $todo[] = ['Absent(s) aujourd\'hui : ' . implode(', ', array_map(static fn (string $n, string $h): string => $n . ($h !== '' ? ' (' . $h . ')' : ''), array_keys($away), $away)), '/app.php?m=staffzen&p=planning', 'info'];
    }
}
if ($on['teamnest'] && ($late = \App\TeamNest\Tasks::overdueCount($org['id'])) > 0) {
    $todo[] = [$late . ' tâche(s) en retard dans les projets', '/app.php?m=teamnest', 'warn'];
}
?>
<section class="card">
  <div class="card-head">
    <div>
      <h2>Tableau de bord · <?= $e(ucfirst($label($start))) ?></h2>
      <p class="muted small">Comparé à <?= $e($label($start->modify('-1 month'))) ?><?= $isNow ? ' (mois en cours, au ' . $e($now->format('d/m')) . ')' : '' ?>. Montants en roupies.</p>
    </div>
    <div class="actions">
      <a class="btn-secondary" href="/app.php?m=bizpilot&amp;mo=<?= $e($start->modify('-1 month')->format('Y-m')) ?>" aria-label="Mois précédent">‹</a>
      <?php if (!$isNow): ?><a class="btn-secondary" href="/app.php?m=bizpilot">Ce mois-ci</a>
      <a class="btn-secondary" href="/app.php?m=bizpilot&amp;mo=<?= $e($start->modify('+1 month')->format('Y-m')) ?>" aria-label="Mois suivant">›</a><?php endif; ?>
    </div>
  </div>

  <?php if (!in_array(true, $on, true)): ?>
    <p>BizPilot rassemble les chiffres de vos autres applications. Activez-en au moins une (Facturo, RendezVous, ClientBloom, Formelio, FlowDesk, TeamNest) depuis le <a href="/dashboard.php">lanceur</a>.</p>
  <?php else: ?>
    <h3>À faire</h3>
    <?php if ($todo === []): ?>
      <p class="muted">Rien d'urgent.</p>
    <?php else: ?>
      <ul class="todo">
        <?php foreach ($todo as [$text, $href, $level]): ?>
          <li class="todo--<?= $e($level) ?>"><a href="<?= $e($href) ?>"><?= $e($text) ?></a></li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  <?php endif; ?>
</section>

<?php foreach ($tiles as $group => $items): ?>
  <section class="card">
    <h3><?= $e($group) ?></h3>
    <div class="kpis">
      <?php foreach ($items as $k): [$name, $value, $delta, $upIsGood, $sub] = $k; $unit = $k[5] ?? '%'; ?>
        <div class="kpi">
          <span class="kpi-label"><?= $e($name) ?></span>
          <strong class="kpi-value"><?= $e($value) ?></strong>
          <?php if ($delta !== null): $good = $upIsGood === null ? null : (($delta > 0) === $upIsGood); ?>
            <span class="kpi-delta<?= $delta === 0 || $good === null ? '' : ($good ? ' is-good' : ' is-bad') ?>">
              <?= $delta > 0 ? '▲ +' : ($delta < 0 ? '▼ ' : '= ') ?><?= $e($delta) ?> <?= $unit === 'pts' ? 'pts' : '%' ?></span>
          <?php endif; ?>
          <span class="kpi-sub small muted"><?= $e($sub) ?></span>
        </div>
      <?php endforeach; ?>
    </div>
    <?php if ($group === 'Facturation'): $max = max(1, ...array_map(static fn ($m) => max($m['invoiced'], $m['collected']), $trend)); ?>
      <div class="bp-grid">
        <figure class="chart">
          <figcaption class="small muted">6 derniers mois · <span class="legend legend--inv">facturé</span> <span class="legend legend--col">payé</span></figcaption>
          <svg viewBox="0 0 600 220" role="img" aria-label="Facturé et payé par mois">
            <?php foreach ($trend as $i => $m): $x = 20 + $i * 96; $hi = (int) round(160 * max(0, $m['invoiced']) / $max); $hc = (int) round(160 * max(0, $m['collected']) / $max); ?>
              <rect class="bar-inv" x="<?= $x ?>" y="<?= 180 - $hi ?>" width="34" height="<?= $hi ?>"><title><?= $e($rs($m['invoiced'])) ?> facturé</title></rect>
              <rect class="bar-col" x="<?= $x + 38 ?>" y="<?= 180 - $hc ?>" width="34" height="<?= $hc ?>"><title><?= $e($rs($m['collected'])) ?> payé</title></rect>
              <text x="<?= $x + 36 ?>" y="200" text-anchor="middle" class="axis<?= $m['month'] === $month ? ' axis--current' : '' ?>"><?= $e($short($m['month'])) ?></text>
            <?php endforeach; ?>
            <line x1="10" y1="180" x2="590" y2="180" class="baseline"></line>
          </svg>
        </figure>
        <div>
          <p class="small muted">Meilleurs clients du mois</p>
          <?php if ($top === []): ?>
            <p class="muted small">Pas de facture ce mois-ci.</p>
          <?php else: ?>
            <table class="table"><tbody>
              <?php foreach ($top as $t): ?><tr><td><?= $e($t['name']) ?></td><td class="num"><?= $e($rs($t['cents'])) ?></td></tr><?php endforeach; ?>
            </tbody></table>
          <?php endif; ?>
          <?php if ($rc['foreign_docs'] > 0): ?><p class="muted small"><?= (int) $rc['foreign_docs'] ?> document(s) en devise étrangère non comptés ici.</p><?php endif; ?>
        </div>
      </div>
    <?php endif; ?>
  </section>
<?php endforeach; ?>
