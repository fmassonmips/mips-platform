<?php
/**
 * @var callable $e
 * @var string $token
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $settings
 * @var bool $open
 * @var list<array<string,mixed>> $services
 * @var list<array<string,mixed>> $staff
 * @var string $today
 * @var string $maxDate
 * @var string $csrf
 */
use App\Facturo\Money;

$business = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf) ?>">
  <title><?= $e($business) ?> · <?= $e($t['title']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card booking-card">
    <p class="muted small"><?= $e($business) ?></p>
    <h1><?= $e($t['title']) ?></h1>
    <?php if ($profile['address'] !== ''): ?><p class="small muted pre"><?= $e($profile['address']) ?></p><?php endif; ?>
    <?php if ($settings['intro'] !== ''): ?><p class="pre"><?= $e($settings['intro']) ?></p><?php endif; ?>

    <?php if (!$open || $services === [] || $staff === []): ?>
      <p><?= $e($t['closed']) ?><?php if ($profile['phone'] !== ''): ?> <?= $e($profile['phone']) ?><?php endif; ?></p>
    <?php else: ?>
      <p id="bk-error" class="error" role="alert" hidden></p>
      <form id="booking-form" novalidate data-o="<?= $e($token) ?>"
            data-no-times="<?= $e($t['no_times']) ?>" data-pick-time="<?= $e($t['pick_time']) ?>">
        <div class="field"><label for="bk-service"><?= $e($t['service']) ?></label>
          <select id="bk-service" name="service_id">
            <?php foreach ($services as $s): ?>
              <option value="<?= (int) $s['id'] ?>"><?= $e($s['name']) ?> · <?= (int) $s['duration_min'] ?> <?= $e($t['min']) ?><?= $s['price_cents'] !== null ? ' · ' . $e(Money::format((int) $s['price_cents'], 'MUR')) : '' ?></option>
            <?php endforeach; ?>
          </select></div>
        <?php if (count($staff) > 1): ?>
          <div class="field"><label for="bk-staff"><?= $e($t['staff']) ?></label>
            <select id="bk-staff" name="staff_id">
              <option value="0"><?= $e($t['anyone']) ?></option>
              <?php foreach ($staff as $s): ?><option value="<?= (int) $s['id'] ?>"><?= $e($s['name']) ?></option><?php endforeach; ?>
            </select></div>
        <?php else: ?>
          <input type="hidden" name="staff_id" value="0">
        <?php endif; ?>
        <div class="field"><label for="bk-date"><?= $e($t['date']) ?></label>
          <input type="date" id="bk-date" name="date" value="<?= $e($today) ?>" min="<?= $e($today) ?>" max="<?= $e($maxDate) ?>" required></div>

        <fieldset class="slots-field">
          <legend><?= $e($t['times']) ?></legend>
          <div id="bk-slots" class="slots" role="radiogroup" aria-live="polite"></div>
        </fieldset>

        <div class="field"><label for="bk-name"><?= $e($t['name']) ?></label><input type="text" id="bk-name" name="name" maxlength="120" autocomplete="name" required></div>
        <div class="field"><label for="bk-phone"><?= $e($t['phone']) ?></label><input type="tel" id="bk-phone" name="phone" maxlength="40" autocomplete="tel" required></div>
        <div class="field"><label for="bk-email"><?= $e($t['email']) ?></label><input type="email" id="bk-email" name="email" maxlength="254" autocomplete="email"></div>
        <div class="field"><label for="bk-note"><?= $e($t['note']) ?></label><input type="text" id="bk-note" name="note" maxlength="500"></div>
        <button type="submit" class="btn-primary"><?= $e($t['book']) ?></button>
      </form>
    <?php endif; ?>
  </main>
  <script src="/assets/js/rendezvous-book.js"></script>
</body>
</html>
