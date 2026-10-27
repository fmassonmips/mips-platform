<?php
/**
 * Public contact form (served by public/flowdesk/new.php).
 *
 * @var callable $e
 * @var string $token
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $settings
 * @var bool $open
 * @var string $csrf
 */
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
  <main class="auth-card form-card">
    <p class="muted small"><?= $e($business) ?></p>
    <h1><?= $e($t['title']) ?></h1>
    <?php if ($settings['intro'] !== ''): ?><p class="pre"><?= $e($settings['intro']) ?></p><?php endif; ?>
    <?php if (!$open): ?>
      <p><?= $e($t['closed_form']) ?><?php if ($profile['phone'] !== ''): ?> <?= $e($profile['phone']) ?><?php endif; ?></p>
    <?php else: ?>
      <p id="fd-error" class="error" role="alert" hidden></p>
      <form id="fd-new" novalidate data-o="<?= $e($token) ?>">
        <div class="field"><label for="fd-name"><?= $e($t['name']) ?></label><input type="text" id="fd-name" name="name" maxlength="120" autocomplete="name" required></div>
        <div class="field"><label for="fd-email"><?= $e($t['email']) ?></label><input type="email" id="fd-email" name="email" maxlength="254" autocomplete="email" required></div>
        <div class="field"><label for="fd-phone"><?= $e($t['phone']) ?></label><input type="tel" id="fd-phone" name="phone" maxlength="40" autocomplete="tel"></div>
        <div class="field"><label for="fd-subject"><?= $e($t['subject']) ?></label><input type="text" id="fd-subject" name="subject" maxlength="200" required></div>
        <div class="field"><label for="fd-message"><?= $e($t['message']) ?></label><textarea id="fd-message" name="message" rows="6" maxlength="10000" required></textarea></div>
        <div class="hp" aria-hidden="true"><label for="fd-website">Website</label><input type="text" id="fd-website" name="website" tabindex="-1" autocomplete="off"></div>
        <button type="submit" class="btn-primary"><?= $e($t['send']) ?></button>
      </form>
    <?php endif; ?>
  </main>
  <script src="/assets/js/flowdesk-public.js"></script>
</body>
</html>
