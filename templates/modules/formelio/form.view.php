<?php
/**
 * Public form.
 *
 * @var callable $e
 * @var array<string,mixed> $form
 * @var array<string,string> $profile
 * @var string $lang
 * @var array<string,string> $t
 * @var bool $open
 * @var bool $preview
 * @var bool $already
 * @var string $r
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
  <title><?= $e($form['title']) ?> · <?= $e($business) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card form-card">
    <p class="muted small"><?= $e($business) ?></p>
    <h1><?= $e($form['title']) ?></h1>
    <?php if (!empty($form['description'])): ?><p class="pre"><?= $e($form['description']) ?></p><?php endif; ?>

    <?php if ($already): ?>
      <p class="success"><?= $e($t['already']) ?></p>
    <?php elseif (!$open && !$preview): ?>
      <p><?= $e($t['closed']) ?></p>
    <?php else: ?>
      <?php if ($preview): ?><p class="preview-banner"><?= $e($t['preview']) ?></p><?php endif; ?>
      <p id="fm-error" class="error" role="alert" hidden></p>
      <form id="public-form" novalidate data-t="<?= $e($form['public_token']) ?>" data-r="<?= $e($r) ?>">
        <?php foreach ($form['fields'] as $f): $name = 'q_' . $f['id']; $req = $f['required'] ? ' required' : ''; ?>
          <div class="field" data-field="<?= $e($f['id']) ?>" data-type="<?= $e($f['type']) ?>">
            <?php if (in_array($f['type'], ['choice', 'multi', 'rating', 'nps'], true)): ?>
              <fieldset class="q-group">
                <legend><?= $e($f['label']) ?><?php if ($f['required']): ?> <span class="muted small">(<?= $e($t['required']) ?>)</span><?php endif; ?></legend>
                <?php if ($f['type'] === 'rating' || $f['type'] === 'nps'): ?>
                  <div class="scale scale--<?= $e($f['type']) ?>">
                    <?php foreach ($f['type'] === 'rating' ? range(1, 5) : range(0, 10) as $n): ?>
                      <label class="scale-item"><input type="radio" name="<?= $e($name) ?>" value="<?= $n ?>"><span><?= $n ?></span></label>
                    <?php endforeach; ?>
                  </div>
                  <?php if ($f['type'] === 'nps'): ?><div class="scale-legend small muted"><span><?= $e($t['nps_low']) ?></span><span><?= $e($t['nps_high']) ?></span></div><?php endif; ?>
                <?php else: ?>
                  <?php foreach ($f['options'] as $o): ?>
                    <label class="option"><input type="<?= $f['type'] === 'multi' ? 'checkbox' : 'radio' ?>" name="<?= $e($name) ?>" value="<?= $e($o) ?>"> <?= $e($o) ?></label>
                  <?php endforeach; ?>
                <?php endif; ?>
              </fieldset>
            <?php else: ?>
              <label for="<?= $e($name) ?>"><?= $e($f['label']) ?><?php if ($f['required']): ?> <span class="muted small">(<?= $e($t['required']) ?>)</span><?php endif; ?></label>
              <?php if ($f['type'] === 'textarea'): ?>
                <textarea id="<?= $e($name) ?>" name="<?= $e($name) ?>" rows="4" maxlength="5000"<?= $req ?>></textarea>
              <?php else: ?>
                <input id="<?= $e($name) ?>" name="<?= $e($name) ?>"<?= $req ?>
                       type="<?= ['email' => 'email', 'phone' => 'tel', 'number' => 'text', 'date' => 'date'][$f['type']] ?? 'text' ?>"
                       <?= $f['type'] === 'number' ? 'inputmode="decimal"' : '' ?> maxlength="500">
              <?php endif; ?>
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
        <div class="hp" aria-hidden="true"><label for="fm-website">Website</label><input type="text" id="fm-website" name="website" tabindex="-1" autocomplete="off"></div>
        <p class="small muted"><?= $e(sprintf($t['privacy'], $business)) ?></p>
        <button type="submit" class="btn-primary"<?= $preview ? ' disabled' : '' ?>><?= $e($t['submit']) ?></button>
      </form>
      <div id="fm-thanks" class="success pre" role="status" hidden><?= $e(!empty($form['thank_you']) ? $form['thank_you'] : $t['thanks']) ?></div>
    <?php endif; ?>
  </main>
  <script src="/assets/js/formelio-form.js"></script>
</body>
</html>
