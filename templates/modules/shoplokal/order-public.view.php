<?php
/**
 * @var callable $e
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $settings
 * @var array<string,mixed> $order
 * @var bool $isNew
 */
use App\Facturo\Money;
use App\ShopLokal\Orders;
use App\ShopLokal\Products;

$shop = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
$o    = $order;
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e(sprintf($t['order_title'], $o['number'])) ?> · <?= $e($shop) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card form-card">
    <p class="muted small"><?= $e($shop) ?></p>
    <h1><?= $e(sprintf($t['order_title'], $o['number'])) ?></h1>
    <?php if ($isNew): ?><p class="success"><?= $e($t['thanks']) ?></p><?php endif; ?>
    <p class="small"><?= $e($t['status']) ?> : <span class="status status--sl-<?= $e($o['status']) ?>"><?= $e($t['st_' . $o['status']]) ?></span>
      <?php if ($o['status'] !== 'cancelled'): ?> · <?= $e($o['paid_at'] !== null ? $t['paid'] : $t['unpaid']) ?><?php endif; ?></p>
    <table class="table">
      <tbody>
        <?php foreach ($o['lines'] as $l): ?>
          <tr><td><?= (int) $l['quantity'] ?> × <?= $e($l['name']) ?></td><td class="num"><?= $e(Money::format((int) $l['line_total_cents'] + (int) $l['line_tax_cents'], 'MUR')) ?></td></tr>
        <?php endforeach; ?>
        <?php if ((int) $o['delivery_cents'] > 0): ?>
          <tr><td><?= $e($t['delivery']) ?></td><td class="num"><?= $e(Money::format(Products::ttc((int) $o['delivery_cents'], Orders::serviceTaxCode((int) $o['organization_id'])), 'MUR')) ?></td></tr>
        <?php endif; ?>
        <tr><td><strong><?= $e($t['total']) ?></strong></td><td class="num"><strong><?= $e(Money::format((int) $o['total_cents'], 'MUR')) ?></strong></td></tr>
      </tbody>
    </table>
    <p class="small"><?= $e($o['delivery_method'] === 'pickup' ? sprintf($t['pickup_at'], $settings['pickup_address']) : sprintf($t['deliver_to'], $o['address'])) ?></p>
    <?php if ($o['paid_at'] === null && $o['status'] !== 'cancelled'): ?>
      <p class="pay-box"><?= $e(match ($o['payment_method']) {
          'bank' => sprintf($t['pay_bank_how'], $settings['bank_details'], $o['number']),
          'juice' => sprintf($t['pay_juice_how'], $settings['juice_number'], $o['number']),
          default => $t['pay_cod_how'],
      }) ?></p>
    <?php endif; ?>
    <p class="small muted"><?= $e($t['keep_link']) ?></p>
  </main>
</body>
</html>
