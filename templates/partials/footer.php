<?php
/**
 * Closes the page chrome opened in header.php and loads the shared + page JS.
 *
 * Expects:
 * @var string|null $page_script  basename of a JS file under /assets/js (no path)
 */
declare(strict_types=1);

$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
  </main>

  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>

  <script src="/assets/js/app.js"></script>
  <?php if (!empty($page_script)): ?>
  <script src="/assets/js/<?= $e((string) $page_script) ?>"></script>
  <?php endif; ?>
</body>
</html>
