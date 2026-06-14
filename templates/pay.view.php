<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $slug */
/** @var string $disclaimer */
$h = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $h($csrf_token) ?>">
  <meta name="link-slug" content="<?= $h($slug) ?>">
  <title>Pay &middot; PassPass</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <div class="auth-card">
    <h1>Pay by Bank</h1>
    <p class="auth-subtitle">Secure checkout · powered by PassPass</p>

    <div id="link-details" class="stack">Loading…</div>

    <form id="pay-form" hidden class="stack">
      <div class="field" id="amount-field" hidden>
        <label>Amount</label>
        <input type="text" name="amount" placeholder="Enter amount">
      </div>
      <button class="btn-primary" type="submit">Pay now</button>
    </form>

    <div class="notice" id="pay-notice"></div>
    <?php if ($disclaimer !== ''): ?>
    <p class="auth-link" style="margin-top:20px"><?= $h($disclaimer) ?></p>
    <?php endif; ?>
  </div>
  <script src="/assets/js/pay.js"></script>
</body>
</html>
