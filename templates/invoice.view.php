<?php
/** @var array<string,mixed> $invoice */
/** @var array<string,mixed> $issuer */
/** @var string $page_title */
$e   = static fn ($v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$num = static fn ($v, int $d = 2): string => number_format((float) $v, $d, '.', ',');
$periodLabel = (new DateTimeImmutable($invoice['period'] . '-01'))->format('F Y');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e($page_title) ?> &middot; MIPS Dashboard</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="invoice-body">
  <main class="invoice">
    <?php if ($invoice['status'] !== 'issued' && $invoice['status'] !== 'paid'): ?>
      <p class="invoice-watermark"><?= $e(strtoupper((string) $invoice['status'])) ?> &mdash; not a valid invoice</p>
    <?php endif; ?>
    <header class="invoice-head">
      <div>
        <h1><?= $e($issuer['name'] ?? 'MIPS') ?></h1>
        <?php if (!empty($issuer['address'])): ?><p><?= nl2br($e($issuer['address'])) ?></p><?php endif; ?>
        <?php if (!empty($issuer['brn'])): ?><p>BRN: <?= $e($issuer['brn']) ?></p><?php endif; ?>
        <?php if (!empty($issuer['vat_no'])): ?><p>VAT: <?= $e($issuer['vat_no']) ?></p><?php endif; ?>
      </div>
      <dl class="meta">
        <dt>Invoice</dt><dd><?= $e($invoice['number'] ?? 'Draft #' . $invoice['id']) ?></dd>
        <dt>Period</dt><dd><?= $e($periodLabel) ?></dd>
        <dt>Issued</dt><dd><?= $e($invoice['issued_at'] ?? '-') ?></dd>
        <dt>Status</dt><dd><?= $e($invoice['status']) ?></dd>
      </dl>
    </header>

    <section class="invoice-to">
      <h2>Bill to</h2>
      <p><strong><?= $e($invoice['legal_name'] ?: $invoice['merchant_name']) ?></strong></p>
      <?php if (!empty($invoice['legal_name']) && $invoice['legal_name'] !== $invoice['merchant_name']): ?><p><?= $e($invoice['merchant_name']) ?></p><?php endif; ?>
      <?php if (!empty($invoice['address'])): ?><p><?= nl2br($e($invoice['address'])) ?></p><?php endif; ?>
      <?php if (!empty($invoice['brn'])): ?><p>BRN: <?= $e($invoice['brn']) ?></p><?php endif; ?>
      <?php if (!empty($invoice['vat_number'])): ?><p>VAT: <?= $e($invoice['vat_number']) ?></p><?php endif; ?>
      <?php if (!empty($invoice['billing_email'])): ?><p><?= $e($invoice['billing_email']) ?></p><?php endif; ?>
    </section>

    <table class="data">
      <thead>
        <tr><th>Rail</th><th>Channel</th><th class="num">Txn</th><th class="num">Volume (<?= $e($invoice['currency']) ?>)</th>
            <th class="num">Rate %</th><th class="num">Fixed / txn</th><th class="num">Commission</th></tr>
      </thead>
      <tbody>
        <?php foreach ($invoice['lines'] as $l): ?>
          <tr<?= $l['fee_rule_id'] === null ? ' class="warn"' : '' ?>>
            <td><?= $e($l['sof_proc_nickname'] !== '' ? $l['sof_proc_nickname'] : '(blank)') ?><?= $l['fee_rule_id'] === null ? ' &mdash; no fee rule' : '' ?></td>
            <td><?= $e($l['channel']) ?></td>
            <td class="num"><?= $num($l['txn_count'], 0) ?></td>
            <td class="num"><?= $num($l['volume']) ?></td>
            <td class="num"><?= $num($l['rate_pct'], 4) ?></td>
            <td class="num"><?= $num($l['fixed_fee']) ?></td>
            <td class="num"><?= $num($l['amount']) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
      <tfoot>
        <tr><td colspan="6">Subtotal</td><td class="num"><?= $num($invoice['subtotal']) ?></td></tr>
        <tr><td colspan="6">VAT <?= $num($invoice['vat_rate']) ?>%</td><td class="num"><?= $num($invoice['vat_amount']) ?></td></tr>
        <tr class="total"><td colspan="6">Total <?= $e($invoice['currency']) ?></td><td class="num"><?= $num($invoice['total']) ?></td></tr>
      </tfoot>
    </table>
    <p class="muted no-print"><a href="/billing.php">&larr; Back to billing</a> &middot; Use your browser's print to save as PDF.</p>
  </main>
</body>
</html>
