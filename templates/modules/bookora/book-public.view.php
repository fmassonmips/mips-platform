<?php
/**
 * @var callable $e
 * @var string $token
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $settings
 * @var bool $open
 * @var list<array<string,mixed>> $units
 * @var DateTimeImmutable $today
 * @var string $csrf
 */
use App\Facturo\Money;

$place  = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
$maxCap = $units !== [] ? max(array_map(static fn (array $u): int => (int) $u['capacity'], $units)) : 1;
$min    = $today->format('Y-m-d');
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf) ?>">
  <title><?= $e($place) ?> · <?= $e($t['title']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="shop-body">
  <header class="shop-header">
    <h1><?= $e($place) ?></h1>
    <?php if ($settings['intro'] !== ''): ?><p class="pre"><?= $e($settings['intro']) ?></p><?php endif; ?>
  </header>
  <main class="shop-main">
    <?php if (!$open || $units === []): ?>
      <section class="card"><p><?= $e($t['closed']) ?><?php if ($profile['phone'] !== ''): ?> <?= $e($profile['phone']) ?><?php endif; ?></p></section>
    <?php else: ?>
      <div id="bk" data-o="<?= $e($token) ?>" data-deposit="<?= (int) $settings['deposit_percent'] ?>"
           data-t="<?= $e(json_encode(['available' => $t['available'], 'unavailable' => $t['unavailable'], 'nights' => $t['nights'], 'total' => $t['total'],
               'choose' => $t['choose'], 'none' => $t['none'], 'deposit' => $t['deposit'], 'no_deposit' => $t['no_deposit']], JSON_UNESCAPED_UNICODE)) ?>">
        <form id="bk-search" class="card bk-search" novalidate>
          <div class="field"><label for="b-in"><?= $e($t['check_in']) ?></label><input type="date" id="b-in" name="check_in" min="<?= $e($min) ?>" required></div>
          <div class="field"><label for="b-out"><?= $e($t['check_out']) ?></label><input type="date" id="b-out" name="check_out" min="<?= $e($min) ?>" required></div>
          <div class="field"><label for="b-guests"><?= $e($t['guests']) ?></label>
            <select id="b-guests" name="guests"><?php for ($g = 1; $g <= $maxCap; $g++): ?><option value="<?= $g ?>"<?= $g === min(2, $maxCap) ? ' selected' : '' ?>><?= $g ?></option><?php endfor; ?></select></div>
          <div class="field bk-search-btn"><button type="submit" class="btn-primary"><?= $e($t['search']) ?></button></div>
        </form>
        <p id="bk-error" class="error" role="alert" hidden></p>

        <section class="products bk-units" aria-label="<?= $e($t['title']) ?>">
          <?php foreach ($units as $u): ?>
            <article class="product bk-unit" data-unit="<?= (int) $u['id'] ?>">
              <?php if ($u['image'] !== null): ?><img src="<?= $e($u['image']) ?>" alt="" loading="lazy"><?php else: ?><div class="product-noimg" aria-hidden="true"><?= $e(mb_substr($u['name'], 0, 1)) ?></div><?php endif; ?>
              <div class="product-body">
                <h2><?= $e($u['name']) ?></h2>
                <p class="small muted"><?= $e(sprintf($t['up_to'], (int) $u['capacity'])) ?><?= (int) $u['min_nights'] > 1 ? ' · ' . $e(sprintf($t['min_nights'], (int) $u['min_nights'])) : '' ?></p>
                <?php if (!empty($u['description'])): ?><p class="small pre"><?= $e($u['description']) ?></p><?php endif; ?>
                <div class="product-foot"><strong><?= $e(sprintf($t['from'], Money::format((int) $u['price_ttc_cents'], 'MUR'))) ?></strong></div>
                <div class="bk-quote" hidden></div>
              </div>
            </article>
          <?php endforeach; ?>
        </section>

        <section class="card bk-form" id="bk-book" hidden>
          <p class="small"><a href="#" id="bk-back"><?= $e($t['back']) ?></a></p>
          <h2 id="bk-title"></h2>
          <ul id="bk-lines" class="bk-lines"></ul>
          <p><strong id="bk-total"></strong></p>
          <p class="small" id="bk-deposit"></p>
          <form id="bk-request" novalidate>
            <h3><?= $e($t['your_details']) ?></h3>
            <div class="field"><label for="g-name"><?= $e($t['name']) ?></label><input type="text" id="g-name" name="name" maxlength="120" autocomplete="name" required></div>
            <div class="field"><label for="g-phone"><?= $e($t['phone']) ?></label><input type="tel" id="g-phone" name="phone" maxlength="40" autocomplete="tel" required></div>
            <div class="field"><label for="g-email"><?= $e($t['email']) ?></label><input type="email" id="g-email" name="email" maxlength="254" autocomplete="email"></div>
            <div class="field"><label for="g-note"><?= $e($t['note']) ?></label><input type="text" id="g-note" name="note" maxlength="500"></div>
            <div class="hp" aria-hidden="true"><label for="g-website">Website</label><input type="text" id="g-website" name="website" tabindex="-1" autocomplete="off"></div>
            <p id="bk-form-error" class="error" role="alert" hidden></p>
            <button type="submit" class="btn-primary"><?= $e($t['send']) ?></button>
            <p class="small muted"><?= $e($t['incl_vat']) ?> · <?= $e($settings['checkin_time']) ?> / <?= $e($settings['checkout_time']) ?></p>
          </form>
        </section>
      </div>
    <?php endif; ?>
  </main>
  <script src="/assets/js/bookora-book.js"></script>
</body>
</html>
