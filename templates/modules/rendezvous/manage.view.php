<?php
/**
 * @var callable $e
 * @var string $token
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $appt
 * @var bool $isPast
 * @var bool $cancellable
 * @var bool $justBooked
 * @var string $csrf
 */
use App\Format;

$business = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
$status   = (string) $appt['status'];
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf) ?>">
  <title><?= $e($business) ?> · <?= $e($t['your_appt']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card booking-card">
    <p class="muted small"><?= $e($business) ?></p>
    <h1><?= $e($justBooked && $status === 'booked' ? $t['confirmed'] : $t['your_appt']) ?></h1>
    <?php if ($status === 'cancelled'): ?>
      <p class="error"><?= $e($t['cancelled']) ?></p>
    <?php elseif ($isPast): ?>
      <p class="muted"><?= $e($t['past']) ?></p>
    <?php endif; ?>
    <dl class="appt-details">
      <dt><?= $e($t['service']) ?></dt><dd><?= $e($appt['service_name']) ?> · <?= (int) $appt['duration_min'] ?> <?= $e($t['min']) ?></dd>
      <dt><?= $e($t['when']) ?></dt><dd><strong><?= $e(Format::date((string) $appt['starts_at'])) ?> <?= $e($t['at']) ?> <?= $e(substr((string) $appt['starts_at'], 11, 5)) ?></strong></dd>
      <dt><?= $e($t['with']) ?></dt><dd><?= $e($appt['staff_name']) ?></dd>
      <?php if ($profile['address'] !== ''): ?><dt><?= $e($t['where']) ?></dt><dd class="pre"><?= $e($profile['address']) ?></dd><?php endif; ?>
    </dl>
    <?php if ($status === 'booked' && !$isPast): ?>
      <p class="small muted"><?= $e($t['keep_link']) ?></p>
      <p id="bk-error" class="error" role="alert" hidden></p>
      <?php if ($cancellable): ?>
        <button type="button" class="btn-secondary" id="bk-cancel" data-t="<?= $e($appt['token']) ?>" data-confirm="<?= $e($t['cancel_confirm']) ?>"><?= $e($t['cancel']) ?></button>
      <?php else: ?>
        <p class="small"><?= $e(sprintf($t['cancel_too_late'], $profile['phone'] !== '' ? sprintf($t['call_us'], $profile['phone']) : '')) ?></p>
      <?php endif; ?>
    <?php endif; ?>
  </main>
  <script src="/assets/js/rendezvous-book.js"></script>
</body>
</html>
