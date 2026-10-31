<?php
/**
 * Delete the companies whose owner asked to close the account, once the
 * 30-day delay is over (App\Suite\Closure), and usage history older than
 * 13 months. Run daily from cron:
 *   45 22 * * *  php tools/purge_companies.php
 * Exits 1 when a company could not be deleted, so cron alerts.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$pdo = \App\Database::connection();
if ((int) $pdo->query("SELECT GET_LOCK('purge_companies', 0)")->fetchColumn() !== 1) {
    echo "Another run is in progress.\n";
    exit(0);
}
$status = 0;
try {
    $due = $pdo->query('SELECT id FROM organizations WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= NOW()')->fetchAll(\PDO::FETCH_COLUMN);
    foreach ($due as $orgId) {
        try {
            \App\Suite\Closure::purge((int) $orgId);
            echo "Company #$orgId deleted.\n";
        } catch (\Throwable $e) {
            error_log('[purge_companies] #' . $orgId . ': ' . $e->getMessage());
            echo "Company #$orgId could not be deleted: see the PHP log.\n";
            $status = 1;
        }
    }
    echo count($due) . " company(ies) due.\n";
    // Usage history is kept 13 months (privacy policy).
    $pdo->exec('DELETE FROM user_activity WHERE day < CURDATE() - INTERVAL 13 MONTH');
} finally {
    $pdo->query("SELECT RELEASE_LOCK('purge_companies')");
}
exit($status);
