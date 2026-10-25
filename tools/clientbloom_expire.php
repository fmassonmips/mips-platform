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

foreach ($orgs as $orgId) {
    $n = \App\ClientBloom\Ledger::expire((int) $orgId);
    echo date('c'), " org $orgId: $n balance(s) expired\n";
}
