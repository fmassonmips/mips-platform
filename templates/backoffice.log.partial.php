<?php
/**
 * Back-office log entries (company page: that company; home: all companies).
 *
 * @var callable $e
 * @var list<array<string,mixed>> $log
 * @var array<string,mixed>|null $company
 */
use App\Backoffice\Log;
use App\Format;
?>
<?php if ($log === []): ?>
  <p class="muted">Rien pour l'instant.</p>
<?php else: ?>
  <ul class="bo-log">
    <?php foreach ($log as $l): ?>
      <li>
        <span class="muted small"><?= $e(Format::dateTime((string) $l['created_at'])) ?> · <?= $e($l['staff_name']) ?></span>
        <?php if ($company === null && $l['organization_id'] !== null): ?>
          · <a href="/backoffice.php?org=<?= (int) $l['organization_id'] ?>"><?= $e($l['organization_name']) ?></a>
        <?php endif; ?>
        <br><strong><?= $e(Log::ACTIONS[$l['action']] ?? $l['action']) ?></strong><?= $l['detail'] !== '' ? ' — ' . $e($l['detail']) : '' ?>
      </li>
    <?php endforeach; ?>
  </ul>
<?php endif; ?>
