<?php
/**
 * @var callable $e
 * @var array<string,mixed> $doc
 */
$lang = \App\Facturo\Documents::language($doc);
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e($doc['number']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="print-body">
  <div class="print-toolbar">
    <button type="button" id="print-btn" class="btn-secondary"><?= $e(\App\Facturo\DocText::for($lang)['print']) ?></button>
  </div>
  <?php require TEMPLATES_PATH . '/modules/facturo/document.partial.php'; ?>
  <script src="/assets/js/facturo-print.js"></script>
</body>
</html>
