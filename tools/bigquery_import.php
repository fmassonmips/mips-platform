<?php
/**
 * Import one month of Commission_Data from BigQuery (config 'bigquery').
 *
 *   php tools/bigquery_import.php                 previous month
 *   php tools/bigquery_import.php --period=2026-09
 *   php tools/bigquery_import.php --dry-run       show the query, read nothing
 *
 * Cron (2nd of each month, 06:10):   10 6 2 * *  php /path/to/tools/bigquery_import.php
 * A month that already has issued invoices is refused, as for a file upload.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require __DIR__ . '/../src/bootstrap.php';

$opts   = getopt('', ['period:', 'dry-run']);
$period = $opts['period'] ?? (new DateTimeImmutable('first day of last month'))->format('Y-m');
if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string) $period)) {
    fwrite(STDERR, "Invalid --period (YYYY-MM)\n");
    exit(2);
}
if (!\App\Reporting\BigQuery::enabled()) {
    fwrite(STDERR, "BigQuery import is disabled (config bigquery.enabled)\n");
    exit(2);
}

if (isset($opts['dry-run'])) {
    [$sql, $params] = (new \App\Reporting\BigQuery())->monthQuery((string) $period);
    echo $sql, "\n", json_encode($params, JSON_PRETTY_PRINT), "\n";
    exit(0);
}

try {
    $r = \App\Reporting\BigQueryImport::run((string) $period, null);
} catch (\Throwable $e) {
    \App\Audit::log('import.rejected', 'import', null, ['source' => 'bigquery', 'period' => $period, 'reason' => $e->getMessage()],
        ['id' => null, 'email' => 'scheduler']);
    fwrite(STDERR, "FAILED $period: " . $e->getMessage() . "\n");
    exit(1);
}
printf("%s: %d rows read, %d clean, import #%d%s\n", $period, $r['rows_raw'], $r['rows_clean'], $r['import_id'],
    isset($r['warning']) ? "\nWARNING: " . $r['warning'] : '');
