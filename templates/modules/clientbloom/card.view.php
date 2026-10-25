<?php
/**
 * @var callable $e
 * @var array<string,mixed> $customer
 * @var array<string,string> $profile
 * @var array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int} $rules
 * @var list<array<string,mixed>> $history
 */
use App\ClientBloom\Ledger;
use App\Facturo\Money;

$business = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e($business) ?> · Loyalty card</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card loyalty-card">
    <p class="muted small"><?= $e($business) ?></p>
    <h1><?= $e($customer['name']) ?></h1>
    <div class="balance balance--big"><span class="muted small">Your cashback</span>
      <strong><?= $e(Money::format((int) $customer['balance_cents'], 'MUR')) ?></strong></div>
    <p class="small">Earn <?= $e(Money::rateToInput($rules['cashback_bp'])) ?>% on every purchase at <?= $e($business) ?>.
      Usable from <?= $e(Money::format($rules['min_redeem_cents'], 'MUR')) ?>.
      <?php if ($rules['expiry_months'] > 0): ?>Expires after <?= (int) $rules['expiry_months'] ?> months without a visit.<?php endif; ?>
      Show this card or give your phone number at the counter.</p>
    <?php if ($history !== []): ?>
      <table class="table">
        <tbody>
          <?php foreach ($history as $t): ?>
            <tr><td><?= $e(substr((string) $t['created_at'], 0, 10)) ?></td>
              <td><?= $e(Ledger::LABELS[$t['type']] ?? $t['type']) ?></td>
              <td class="num"><?= $e(((int) $t['cashback_cents'] > 0 ? '+' : '') . Money::format((int) $t['cashback_cents'], 'MUR')) ?></td></tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </main>
</body>
</html>
