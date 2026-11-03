<?php
/**
 * One month of Commission_Data from BigQuery through the standard importer
 * (same cleaning rules, same month replacement and invoice lock as a file
 * upload). Used by the Reports page and by tools/bigquery_import.php.
 */
declare(strict_types=1);

namespace App\Reporting;

use App\Audit;

final class BigQueryImport
{
    /**
     * @param int|null $userId null when run by the scheduler
     * @return array<string,mixed> importer result
     */
    public static function run(string $period, ?int $userId): array
    {
        $bq     = new BigQuery();
        $source = 'bigquery:' . $bq->tableName() . ' ' . $period;

        // Fingerprint of the rows actually read, computed while streaming.
        $hash = hash_init('sha256');
        $rows = (static function () use ($bq, $period, $hash): \Generator {
            foreach ($bq->monthRows($period) as $r) {
                hash_update($hash, json_encode($r, JSON_UNESCAPED_UNICODE) . "\n");
                yield $r;
            }
        })();

        $importer = new CommissionImporter();
        $result   = $importer->importRows($rows, $source, 'pending', $period, $userId);
        $sha      = hash_final($hash);
        $importer->setFingerprint((int) $result['import_id'], $sha);

        // Rows dated outside the month would mean a time zone or column mismatch.
        $other = array_diff(array_keys($result['periods']), [$period]);
        if ($other !== []) {
            $result['warning'] = 'Rows dated outside ' . $period . ' were returned: ' . implode(', ', $other)
                . '. Check bigquery.date_column / date_column_type / timezone.';
        }

        Audit::log('import.create', 'import', (int) $result['import_id'], [
            'source' => 'bigquery', 'table' => $bq->tableName(), 'period' => $period, 'sha256' => $sha,
            'rows_raw' => $result['rows_raw'], 'rows_clean' => $result['rows_clean'], 'replaced_periods' => $result['replaced_periods'],
        ], $userId === null ? ['id' => null, 'email' => 'scheduler'] : null);

        return $result;
    }
}
