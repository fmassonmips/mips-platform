<?php
/**
 * Retry MRA fiscalisation of pending documents for every organization.
 * Run from cron every few minutes, e.g.:
 *   *\/5 * * * * php /path/to/mips-platform/tools/mra_retry.php
 * (The MRA functional specs require pending invoices to be sent automatically
 * once the connection is back.)
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$orgs = \App\Database::connection()->query(
    "SELECT DISTINCT organization_id FROM facturo_documents WHERE mra_status = 'pending'"
)->fetchAll(PDO::FETCH_COLUMN);

$failed = 0;
foreach ($orgs as $orgId) {
    try {
        $n = \App\Facturo\Fiscalisation::processPending((int) $orgId);
        echo date('c'), " org $orgId: $n fiscalised\n";
    } catch (\Throwable $e) {   // one company's failure must not stop the others
        $failed++;
        error_log('[mra_retry] org ' . $orgId . ': ' . $e->getMessage());
        echo date('c'), " org $orgId: ERROR ", $e->getMessage(), "\n";
    }
}
exit($failed > 0 ? 1 : 0);
