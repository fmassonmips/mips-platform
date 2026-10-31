<?php
/**
 * Expire ClientBloom cashback of customers inactive beyond each program's
 * expiry period. Run daily from cron, e.g.:
 *   15 2 * * * php /path/to/mips-platform/tools/clientbloom_expire.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$orgs = \App\Database::connection()->query(
    'SELECT DISTINCT organization_id FROM clientbloom_customers WHERE balance_cents > 0'
)->fetchAll(PDO::FETCH_COLUMN);

$failed = 0;
foreach ($orgs as $orgId) {
    try {
        $n = \App\ClientBloom\Ledger::expire((int) $orgId);
        echo date('c'), " org $orgId: $n balance(s) expired\n";
    } catch (\Throwable $e) {   // one company's failure must not stop the others
        $failed++;
        error_log('[clientbloom_expire] org ' . $orgId . ': ' . $e->getMessage());
        echo date('c'), " org $orgId: ERROR ", $e->getMessage(), "\n";
    }
}
exit($failed > 0 ? 1 : 0);
