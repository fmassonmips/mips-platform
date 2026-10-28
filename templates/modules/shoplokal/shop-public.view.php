<?php
/**
 * @var callable $e
 * @var string $token
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $settings
 * @var bool $open
 * @var list<array<string,mixed>> $products
 * @var int $deliveryTtc
 * @var string $csrf
 */
use App\Facturo\Money;
use App\ShopLokal\Products;

$shop = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
$data = array_map(static fn (array $p): array => [
    'id' => (int) $p['id'], 'name' => $p['name'], 'price' => (int) $p['price_cents'], 'rate' => Products::rate((string) $p['tax_code']),
    'stock' => $p['stock'] !== null ? (int) $p['stock'] : null,
], $products);
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf) ?>">
  <title><?= $e($shop) ?> · <?= $e($t['shop']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="shop-body">
  <header class="shop-header">
    <h1><?= $e($shop) ?></h1>
    <?php if ($settings['intro'] !== ''): ?><p class="pre"><?= $e($settings['intro']) ?></p><?php endif; ?>
  </header>
  <main class="shop-main">
    <?php if (!$open || $products === []): ?>
      <section class="card"><p><?= $e($t['closed']) ?><?php if ($profile['phone'] !== ''): ?> <?= $e($profile['phone']) ?><?php endif; ?></p></section>
    <?php else: ?>
      <div class="shop-layout" id="shop" data-o="<?= $e($token) ?>" data-products="<?= $e(json_encode($data, JSON_UNESCAPED_UNICODE)) ?>"
           data-delivery="<?= $settings['delivery_enabled'] ? $deliveryTtc : -1 ?>" data-free="<?= $settings['free_delivery_from_cents'] ?? -1 ?>"
           data-t="<?= $e(json_encode(['empty' => $t['empty'], 'remove' => $t['remove'], 'free' => $t['free'], 'left' => $t['left'], 'out' => $t['out']], JSON_UNESCAPED_UNICODE)) ?>">
        <section class="products" aria-label="<?= $e($t['shop']) ?>">
          <?php foreach ($products as $p): $out = $p['stock'] !== null && (int) $p['stock'] <= 0; ?>
            <article class="product<?= $out ? ' is-out' : '' ?>">
              <?php if ($p['image'] !== null): ?><img src="<?= $e($p['image']) ?>" alt="" loading="lazy"><?php else: ?><div class="product-noimg" aria-hidden="true"><?= $e(mb_substr($p['name'], 0, 1)) ?></div><?php endif; ?>
              <div class="product-body">
                <h2><?= $e($p['name']) ?></h2>
                <?php if (!empty($p['description'])): ?><p class="small muted pre"><?= $e($p['description']) ?></p><?php endif; ?>
                <div class="product-foot">
                  <strong><?= $e(Money::format((int) $p['price_ttc_cents'], 'MUR')) ?></strong>
                  <?php if ($out): ?><span class="muted small"><?= $e($t['out']) ?></span>
                  <?php else: ?><button type="button" class="btn-secondary" data-add="<?= (int) $p['id'] ?>"><?= $e($t['add']) ?></button><?php endif; ?>
                </div>
                <?php if (!$out && $p['stock'] !== null && (int) $p['stock'] <= 5): ?><p class="small text-danger"><?= $e(sprintf($t['left'], (int) $p['stock'])) ?></p><?php endif; ?>
              </div>
            </article>
          <?php endforeach; ?>
        </section>

        <aside class="card cart" id="cart">
          <h2><?= $e($t['cart']) ?> <span class="muted small" id="cart-count"></span></h2>
          <ul id="cart-lines" class="cart-lines"></ul>
          <form id="checkout" novalidate>
            <fieldset class="q-group"><legend><?= $e($t['how']) ?></legend>
              <?php if ($settings['delivery_enabled']): ?><label class="option"><input type="radio" name="delivery_method" value="delivery" checked> <?= $e($t['delivery']) ?>
                <span class="muted small"><?= $deliveryTtc > 0 ? Money::format($deliveryTtc, 'MUR') : $e($t['free']) ?></span></label><?php endif; ?>
              <?php if ($settings['pickup_enabled']): ?><label class="option"><input type="radio" name="delivery_method" value="pickup"<?= $settings['delivery_enabled'] ? '' : ' checked' ?>> <?= $e($t['pickup']) ?>
                <span class="muted small"><?= $e($settings['pickup_address']) ?></span></label><?php endif; ?>
              <?php if ($settings['delivery_enabled'] && $settings['free_delivery_from_cents'] !== null && $deliveryTtc > 0): ?>
                <p class="small muted"><?= $e(sprintf($t['free_from'], Money::format($settings['free_delivery_from_cents'], 'MUR'))) ?></p><?php endif; ?>
            </fieldset>
            <dl class="cart-totals">
              <dt><?= $e($t['items']) ?></dt><dd id="sum-items">—</dd>
              <dt id="sum-delivery-label"><?= $e($t['delivery']) ?></dt><dd id="sum-delivery">—</dd>
              <dt><strong><?= $e($t['total']) ?></strong></dt><dd><strong id="sum-total">—</strong></dd>
            </dl>
            <div class="field"><label for="c-name"><?= $e($t['name']) ?></label><input type="text" id="c-name" name="name" maxlength="120" autocomplete="name" required></div>
            <div class="field"><label for="c-phone"><?= $e($t['phone']) ?></label><input type="tel" id="c-phone" name="phone" maxlength="40" autocomplete="tel" required></div>
            <div class="field"><label for="c-email"><?= $e($t['email']) ?></label><input type="email" id="c-email" name="email" maxlength="254" autocomplete="email"></div>
            <div class="field" id="address-field"><label for="c-address"><?= $e($t['address']) ?></label><textarea id="c-address" name="address" rows="2" maxlength="500" autocomplete="street-address"></textarea></div>
            <fieldset class="q-group"><legend><?= $e($t['pay']) ?></legend>
              <?php $first = true; foreach (['cod' => $settings['pay_cod'], 'bank' => $settings['pay_bank'], 'juice' => $settings['pay_juice']] as $k => $on): if (!$on) { continue; } ?>
                <label class="option"><input type="radio" name="payment_method" value="<?= $k ?>"<?= $first ? ' checked' : '' ?>> <?= $e($t[$k]) ?></label>
              <?php $first = false; endforeach; ?>
            </fieldset>
            <div class="field"><label for="c-note"><?= $e($t['note']) ?></label><input type="text" id="c-note" name="note" maxlength="500"></div>
            <div class="hp" aria-hidden="true"><label for="c-website">Website</label><input type="text" id="c-website" name="website" tabindex="-1" autocomplete="off"></div>
            <p id="sl-error" class="error" role="alert" hidden></p>
            <button type="submit" class="btn-primary"><?= $e($t['order']) ?></button>
            <p class="small muted"><?= $e($t['incl_vat']) ?></p>
          </form>
        </aside>
      </div>
    <?php endif; ?>
  </main>
  <script src="/assets/js/shoplokal-shop.js"></script>
</body>
</html>
