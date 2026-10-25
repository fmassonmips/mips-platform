<?php
/**
 * Imports a Commission_Data export (.xlsx or .csv) into `transactions`.
 *
 * Frozen cleaning rules, applied per month:
 *  - keep last_transaction_status == SUCCESS only
 *  - drop test rows (est_test or is_test_order truthy)
 *  - drop refund-only rows (somme_totale == 0 and refund_total_refunded > 0),
 *    counted and reported; refunds are never netted from volume
 *  - channel: TPE when is_for_till_id is set, ONLINE otherwise
 *  - merchant: form_name, fallback form_nickname
 *
 * A month present in the file replaces that month's previous data entirely
 * (latest import wins). Months that already have issued or paid invoices
 * are locked: the whole import is rejected until those invoices are voided.
 */
declare(strict_types=1);

namespace App\Reporting;

use App\Database;
use PDO;
use RuntimeException;

final class CommissionImporter
{
    private const REQUIRED = ['sof_proc_nickname', 'somme_totale', 'symbole_monnaie', 'is_for_till_id', 'fi_name', 'form_name'];
    private const DATE_CANDIDATES = ['date_transaction', 'transaction_date', 'created_at', 'date_creation', 'date', 'last_transaction_date'];
    private const BATCH = 500;

    private PDO $db;
    /** @var array<string,int> */
    private array $merchantIds = [];

    public function __construct()
    {
        $this->db = Database::connection();
    }

    /**
     * @param string      $path           uploaded file on disk
     * @param string      $filename       original client filename (used to pick the parser)
     * @param string|null $periodOverride YYYY-MM, used only when the file has no date column
     * @return array{import_id:int, periods:array<string,array<string,int|float>>, rows_raw:int, rows_clean:int, rows_bad_date:int, rows_bad_amount:int, date_column:?string, replaced_periods:list<string>}
     */
    public function import(string $path, string $filename, ?string $periodOverride, int $userId): array
    {
        // Generators cannot be rewound: read the header, then keep iterating
        // the same generator for the data rows.
        $rows   = $this->open($path, $filename);
        $header = null;
        for (; $rows->valid(); $rows->next()) {
            $r = $rows->current();
            if (!self::isBlankRow($r)) {
                $header = array_map(static fn ($v) => trim((string) $v), $r);
                $rows->next();
                break;
            }
        }
        if ($header === null) {
            throw new RuntimeException('The file is empty.');
        }

        $col     = array_flip($header);
        $missing = array_values(array_diff(self::REQUIRED, $header));
        if ($missing !== []) {
            throw new RuntimeException('Missing columns: ' . implode(', ', $missing) . '. Column names must match the Commission_Data export.');
        }
        $dateCol = $this->findDateColumn($header);
        if ($dateCol === null && $periodOverride === null) {
            throw new RuntimeException('No date column found. Provide the month (YYYY-MM) for this file.');
        }

        $this->db->beginTransaction();
        try {
            $ins = $this->db->prepare(
                'INSERT INTO imports (filename, file_sha256, imported_by, created_at) VALUES (:f, :h, :u, NOW())'
            );
            $ins->execute([':f' => mb_substr($filename, 0, 255), ':h' => hash_file('sha256', $path), ':u' => $userId]);
            $importId = (int) $this->db->lastInsertId();

            $stats   = [];
            $batch   = [];
            $badDate = 0;
            $badAmt  = 0;
            $raw     = 0;

            $empty = ['rows_raw' => 0, 'rows_not_success' => 0, 'rows_test' => 0, 'rows_refund_only' => 0, 'refund_total_reported' => 0.0, 'rows_clean' => 0];

            for (; $rows->valid(); $rows->next()) {
                $r = $rows->current();
                if (self::isBlankRow($r)) {
                    continue;
                }
                $raw++;
                $get = static fn (string $name): string => isset($col[$name]) ? trim((string) ($r[$col[$name]] ?? '')) : '';

                if ($dateCol !== null) {
                    $date = self::parseDate($get($dateCol));
                    if ($date === null) {
                        $badDate++;
                        continue;
                    }
                } else {
                    $date = $periodOverride . '-01';
                }
                $period = substr($date, 0, 7);
                $stats[$period] ??= $empty;

                $amount = self::parseAmount($get('somme_totale'));
                if ($amount === null) {
                    $badAmt++;
                    continue;
                }
                $stats[$period]['rows_raw']++;

                if (isset($col['last_transaction_status']) && strtoupper($get('last_transaction_status')) !== 'SUCCESS') {
                    $stats[$period]['rows_not_success']++;
                    continue;
                }
                if (self::truthy($get('est_test')) || self::truthy($get('is_test_order'))) {
                    $stats[$period]['rows_test']++;
                    continue;
                }

                $refund = self::parseAmount($get('refund_total_refunded')) ?? 0.0;
                $stats[$period]['refund_total_reported'] += $refund;
                if ($amount == 0.0 && $refund > 0) {
                    $stats[$period]['rows_refund_only']++;
                    continue;
                }
                $stats[$period]['rows_clean']++;

                $nickname = $get('sof_proc_nickname');
                $merchant = $get('form_name');
                if ($merchant === '') {
                    $merchant = $get('form_nickname');
                }
                if ($merchant === '') {
                    $merchant = '(blank)';
                }

                $batch[] = [
                    $importId,
                    $period,
                    $date,
                    $this->merchantId($merchant),
                    $nickname,
                    Rails::type($nickname),
                    self::isSet($get('is_for_till_id')) ? 'TPE' : 'ONLINE',
                    $get('fi_name'),
                    strtoupper($get('symbole_monnaie')),
                    round($amount, 2),
                    round($refund, 2),
                ];
                if (count($batch) >= self::BATCH) {
                    $this->flush($batch);
                    $batch = [];
                }
            }
            $this->flush($batch);

            if ($stats === []) {
                throw new RuntimeException('No usable rows found in the file.');
            }

            $periods = array_keys($stats);
            ksort($stats);
            $this->assertPeriodsUnlocked($periods);

            // Latest import wins: drop previous data for the months this file covers.
            $in = implode(',', array_fill(0, count($periods), '?'));
            $replaced = $this->db->prepare("SELECT period FROM import_periods WHERE period IN ($in)");
            $replaced->execute($periods);
            $replacedPeriods = array_map('strval', $replaced->fetchAll(PDO::FETCH_COLUMN));

            $del = $this->db->prepare("DELETE FROM transactions WHERE period IN ($in) AND import_id <> ?");
            $del->execute([...$periods, $importId]);
            $this->db->prepare("DELETE FROM import_periods WHERE period IN ($in)")->execute($periods);
            // Draft invoices for those months are now stale.
            $this->db->prepare("DELETE FROM invoices WHERE period IN ($in) AND status = 'draft'")->execute($periods);

            $ip = $this->db->prepare(
                'INSERT INTO import_periods
                    (period, import_id, rows_raw, rows_not_success, rows_test, rows_refund_only, refund_total_reported, rows_clean)
                 VALUES (:p, :i, :raw, :ns, :t, :ro, :rt, :c)'
            );
            $clean = 0;
            foreach ($stats as $period => $s) {
                $ip->execute([
                    ':p' => $period, ':i' => $importId, ':raw' => $s['rows_raw'], ':ns' => $s['rows_not_success'],
                    ':t' => $s['rows_test'], ':ro' => $s['rows_refund_only'],
                    ':rt' => round($s['refund_total_reported'], 2), ':c' => $s['rows_clean'],
                ]);
                $clean += $s['rows_clean'];
            }

            $this->db->prepare('UPDATE imports SET rows_raw = :r, rows_clean = :c WHERE id = :id')
                ->execute([':r' => $raw, ':c' => $clean, ':id' => $importId]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        foreach ($stats as &$s) {
            $s['refund_total_reported'] = round($s['refund_total_reported'], 2);
        }
        unset($s);

        return [
            'import_id'        => $importId,
            'periods'          => $stats,
            'rows_raw'         => $raw,
            'rows_clean'       => $clean,
            'rows_bad_date'    => $badDate,
            'rows_bad_amount'  => $badAmt,
            'date_column'      => $dateCol,
            'replaced_periods' => $replacedPeriods,
        ];
    }

    /** @return \Generator<int, list<string>> */
    private function open(string $path, string $filename): \Generator
    {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext === 'xlsx') {
            return XlsxReader::rows($path);
        }
        if ($ext === 'csv') {
            return self::csvRows($path);
        }
        throw new RuntimeException('Unsupported file type. Upload a .xlsx or .csv export.');
    }

    /** @return \Generator<int, list<string>> */
    private static function csvRows(string $path): \Generator
    {
        $fh = fopen($path, 'rb');
        if ($fh === false) {
            throw new RuntimeException('Cannot read the file.');
        }
        $first = (string) fgets($fh);
        rewind($fh);
        if (str_starts_with($first, "\xEF\xBB\xBF")) {
            fread($fh, 3);
        }
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
        while (($r = fgetcsv($fh, 0, $delimiter, '"', '')) !== false) {
            yield array_map('strval', $r);
        }
        fclose($fh);
    }

    /** @param list<string> $header */
    private function findDateColumn(array $header): ?string
    {
        foreach (self::DATE_CANDIDATES as $c) {
            if (in_array($c, $header, true)) {
                return $c;
            }
        }
        foreach ($header as $c) {
            if (str_contains(strtolower($c), 'date')) {
                return $c;
            }
        }
        return null;
    }

    /** @param list<string> $periods */
    private function assertPeriodsUnlocked(array $periods): void
    {
        $in   = implode(',', array_fill(0, count($periods), '?'));
        $stmt = $this->db->prepare(
            "SELECT DISTINCT period FROM invoices WHERE period IN ($in) AND status IN ('issued', 'paid') ORDER BY period"
        );
        $stmt->execute($periods);
        $locked = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if ($locked !== []) {
            throw new RuntimeException(
                'Months with issued invoices cannot be re-imported: ' . implode(', ', $locked) . '. Void those invoices first.'
            );
        }
    }

    private function merchantId(string $name): int
    {
        $name = mb_substr($name, 0, 255);
        if (isset($this->merchantIds[$name])) {
            return $this->merchantIds[$name];
        }
        $this->db->prepare('INSERT IGNORE INTO merchants (name) VALUES (:n)')->execute([':n' => $name]);
        $sel = $this->db->prepare('SELECT id FROM merchants WHERE name = :n');
        $sel->execute([':n' => $name]);
        return $this->merchantIds[$name] = (int) $sel->fetchColumn();
    }

    /** @param list<list<mixed>> $batch */
    private function flush(array $batch): void
    {
        if ($batch === []) {
            return;
        }
        $place = '(' . implode(',', array_fill(0, 11, '?')) . ')';
        $sql   = 'INSERT INTO transactions
                    (import_id, period, txn_date, merchant_id, sof_proc_nickname, rail_type, channel, fi_name, currency, amount, refund_amount)
                  VALUES ' . implode(',', array_fill(0, count($batch), $place));
        $this->db->prepare($sql)->execute(array_merge(...$batch));
    }

    /**
     * Accepts ISO dates (with optional time), d/m/Y (Mauritian convention)
     * and Excel serial numbers. Returns Y-m-d or null.
     */
    public static function parseDate(string $v): ?string
    {
        if ($v === '') {
            return null;
        }
        if (is_numeric($v)) {
            $serial = (float) $v;
            // Plausible Excel serials: 1990-01-01 .. 2100-01-01.
            if ($serial < 32874 || $serial > 73051) {
                return null;
            }
            return gmdate('Y-m-d', (int) round(($serial - 25569) * 86400));
        }
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return "$m[1]-$m[2]-$m[3]";
        }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})#', $v, $m) && checkdate((int) $m[2], (int) $m[1], (int) $m[3])) {
            return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
        }
        return null;
    }

    public static function parseAmount(string $v): ?float
    {
        $v = str_replace([' ', ','], '', $v);
        if ($v === '' || strtolower($v) === 'nan') {
            return $v === '' ? 0.0 : null;
        }
        return is_numeric($v) ? (float) $v : null;
    }

    /** @param list<string> $r */
    private static function isBlankRow(array $r): bool
    {
        foreach ($r as $v) {
            if (trim((string) $v) !== '') {
                return false;
            }
        }
        return true;
    }

    private static function truthy(string $v): bool
    {
        return in_array(strtolower($v), ['1', 'true', 'yes', 'y', 'oui', '1.0'], true);
    }

    private static function isSet(string $v): bool
    {
        return $v !== '' && !in_array(strtolower($v), ['nan', 'null', 'none'], true);
    }
}
