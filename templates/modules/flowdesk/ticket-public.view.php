<?php
/**
 * @var callable $e
 * @var string $lang
 * @var array<string,string> $t
 * @var array<string,string> $profile
 * @var array<string,mixed> $ticket
 * @var list<array<string,mixed>> $messages
 * @var bool $isNew
 * @var string $csrf
 */
use App\Format;

$business = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
$status   = (string) $ticket['status'];
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf) ?>">
  <title><?= $e(sprintf($t['ticket'], $ticket['number'])) ?> · <?= $e($business) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card form-card">
    <p class="muted small"><?= $e($business) ?> · <?= $e(sprintf($t['ticket'], $ticket['number'])) ?></p>
    <h1><?= $e($ticket['subject']) ?></h1>
    <p class="small"><?= $e($t['status']) ?> : <span class="status status--fd-<?= $e($status) ?>"><?= $e($t['st_' . $status]) ?></span></p>
    <?php if ($isNew): ?><p class="success"><?= $e($t['created']) ?></p><?php endif; ?>

    <ol class="thread">
      <?php foreach ($messages as $m): $mine = $m['kind'] === 'customer'; ?>
        <li class="msg <?= $mine ? 'msg--customer' : 'msg--agent' ?>">
          <div class="msg-head small muted"><strong><?= $e($mine ? $t['you'] : $t['support']) ?></strong> · <?= $e(Format::dateTime((string) $m['created_at'])) ?></div>
          <div class="pre"><?= $e($m['body']) ?></div>
        </li>
      <?php endforeach; ?>
    </ol>

    <?php if ($status === 'closed'): ?>
      <p class="muted"><?= $e($t['ticket_closed']) ?></p>
    <?php else: ?>
      <p id="fd-error" class="error" role="alert" hidden></p>
      <form id="fd-reply" novalidate data-t="<?= $e($ticket['token']) ?>">
        <div class="field"><label for="fd-body"><?= $e($t['your_reply']) ?></label><textarea id="fd-body" name="body" rows="4" maxlength="10000" required></textarea></div>
        <button type="submit" class="btn-primary"><?= $e($t['reply']) ?></button>
      </form>
      <p class="small muted"><?= $e($t['keep_link']) ?></p>
    <?php endif; ?>
  </main>
  <script src="/assets/js/flowdesk-public.js"></script>
</body>
</html>
