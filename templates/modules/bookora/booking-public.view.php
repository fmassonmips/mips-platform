<?php
/**
 * @var callable $e
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $settings
 * @var array<string,mixed> $booking
 * @var bool $isNew
 * @var string $csrf
 */
use App\Bookora\Notifier;
use App\Facturo\Money;
use App\Format;

$place = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
$b     = $booking;
$state = $b['state'];
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf) ?>">
  <title><?= $e(sprintf($t['booking_title'], $b['number'])) ?> · <?= $e($place) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card form-card">
    <p class="muted small"><?= $e($place) ?></p>
    <h1><?= $e(sprintf($t['booking_title'], $b['number'])) ?></h1>
    <?php if ($isNew && $state === 'new'): ?><p class="success"><?= $e($t['thanks']) ?></p><?php endif; ?>
    <p class="small"><?= $e($t['status']) ?> : <span class="status status--bk-<?= $e($state) ?>"><?= $e($t['st_' . $state]) ?></span>
      <?php if ($state === 'confirmed' && $b['paid_at'] !== null): ?> · <?= $e($t['paid']) ?><?php elseif ($state === 'confirmed' && $b['deposit_paid_at'] !== null): ?> · <?= $e($t['deposit_received']) ?><?php endif; ?></p>
    <p><strong><?= $e($b['unit_name']) ?></strong> · <?= (int) $b['guests'] ?> <?= $e(mb_strtolower($t['guests'])) ?><br>
      <span class="small"><?= $e(sprintf($t['arrival'], Format::date((string) $b['check_in']), $settings['checkin_time'], Format::date((string) $b['check_out']), $settings['checkout_time'])) ?></span></p>
    <table class="table">
      <tbody>
        <?php foreach ($b['lines'] as $l): ?>
          <tr><td><?= $e($l['description']) ?></td><td class="num"><?= $e(Money::format((int) $l['line_total_cents'] + (int) $l['line_tax_cents'], 'MUR')) ?></td></tr>
        <?php endforeach; ?>
        <tr><td><strong><?= $e($t['total']) ?></strong></td><td class="num"><strong><?= $e(Money::format((int) $b['total_cents'], 'MUR')) ?></strong></td></tr>
      </tbody>
    </table>
    <?php if ($state === 'new'): ?>
      <p class="small"><?= $e(sprintf((int) $b['deposit_cents'] > 0 ? $t['hold'] : $t['hold_no_deposit'], Format::dateTime((string) $b['hold_until']))) ?></p>
    <?php endif; ?>
    <?php if (in_array($state, ['new', 'confirmed'], true) && $b['deposit_paid_at'] === null && $b['paid_at'] === null && (int) $b['deposit_cents'] > 0): ?>
      <p class="pay-box"><?= $e(Notifier::payment((int) $b['organization_id'], $b, $t)) ?></p>
    <?php endif; ?>
    <?php if ($state === 'new'): ?>
      <p><button type="button" class="btn-link danger" id="bk-cancel" data-t="<?= $e((string) $b['token']) ?>" data-confirm="<?= $e($t['cancel_confirm']) ?>"><?= $e($t['cancel']) ?></button></p>
      <p id="bk-error" class="error" role="alert" hidden></p>
    <?php endif; ?>
    <p class="small muted"><?= $e($t['keep_link']) ?><?php if ($profile['phone'] !== ''): ?> · <?= $e($profile['phone']) ?><?php endif; ?></p>
  </main>
  <script src="/assets/js/bookora-book.js"></script>
</body>
</html>
