<?php
/**
 * @var callable $e
 * @var string $lang
 * @var string $today
 * @var array<string,string> $t
 * @var array<string,mixed> $client
 * @var array<string,string> $profile
 * @var array{rows:list<array<string,mixed>>, totals:array<string,array<string,int>>} $statement
 */
use App\Facturo\Money;
use App\Format;

$seller = ($profile['legal_name'] ?? '') !== '' ? $profile['legal_name'] : ($profile['name'] ?? '');
$state  = static fn (array $r): string => match ($r['state']) {
    'paid' => $t['paid'], 'credited_full' => $t['credited_full'], 'late' => sprintf($t['late'], $r['days_late']),
    'open' => $t['open'], default => '',
};
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e($t['title'] . ' — ' . $client['name']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="print-body">
  <div class="print-toolbar">
    <button type="button" id="print-btn" class="btn-secondary"><?= $e($t['print']) ?></button>
  </div>
  <article class="doc statement">
    <header>
      <h1><?= $e($t['title']) ?></h1>
      <p><strong><?= $e($seller) ?></strong><?= ($profile['brn'] ?? '') !== '' ? ' · BRN ' . $e($profile['brn']) : '' ?><br>
        <span class="pre"><?= $e($profile['address'] ?? '') ?></span></p>
      <p><?= $e($t['client']) ?> : <strong id="st-client"><?= $e($client['name']) ?></strong><?= ($client['brn'] ?? '') !== '' ? ' · BRN ' . $e($client['brn']) : '' ?><br>
        <?= $e($t['as_of']) ?> <?= $e(Format::date($today)) ?></p>
    </header>

    <?php if ($statement['rows'] === []): ?>
      <p><?= $e($t['none']) ?></p>
    <?php else: ?>
      <table class="table" id="st-rows">
        <thead><tr><th><?= $e($t['date']) ?></th><th><?= $e($t['document']) ?></th><th><?= $e($t['due']) ?></th>
          <th class="num"><?= $e($t['amount']) ?></th><th class="num"><?= $e($t['credited']) ?></th><th class="num"><?= $e($t['outstanding']) ?></th><th><?= $e($t['status']) ?></th></tr></thead>
        <tbody>
          <?php foreach ($statement['rows'] as $r): ?>
            <tr class="<?= $r['state'] === 'late' ? 'is-late' : '' ?>">
              <td><?= $e(Format::date($r['date'])) ?></td>
              <td><?= $r['type'] === 'credit_note' ? $e(sprintf($t['credit_note'], $r['source'])) . '<br><span class="small muted">' . $e($r['number']) . '</span>' : $e($t['invoice'] . ' ' . $r['number']) ?></td>
              <td><?= $e(Format::date($r['due_date'], '')) ?></td>
              <td class="num"><?= $e(Money::format($r['amount_cents'], $r['currency'])) ?></td>
              <td class="num"><?= $r['credited_cents'] > 0 ? $e(Money::format(-$r['credited_cents'], $r['currency'])) : '' ?></td>
              <td class="num"><?= $r['type'] === 'invoice' ? $e(Money::format($r['outstanding_cents'], $r['currency'])) : '' ?></td>
              <td><?= $e($state($r)) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>

      <dl class="totals" id="st-totals">
        <?php foreach ($statement['totals'] as $cur => $tot): ?>
          <dt><?= $e($t['total_due']) ?> (<?= $e($cur) ?>)</dt><dd><strong><?= $e(Money::format($tot['outstanding'], $cur)) ?></strong></dd>
          <?php if ($tot['late'] > 0): ?><dt><?= $e($t['of_which_late']) ?></dt><dd><?= $e(Money::format($tot['late'], $cur)) ?></dd><?php endif; ?>
        <?php endforeach; ?>
      </dl>
      <?php if (array_sum(array_column($statement['totals'], 'outstanding')) === 0): ?>
        <p><?= $e($t['nothing_due']) ?></p>
      <?php else: ?>
        <p class="small"><?= $e($t['footer']) ?></p>
      <?php endif; ?>
    <?php endif; ?>
  </article>
  <script src="/assets/js/facturo-print.js"></script>
</body>
</html>
