<?php
/**
 * Monthly reporting API.
 *
 *   POST /api/reports/import    multipart: file (.xlsx|.csv), period (YYYY-MM, only if the file has no date column)
 *   GET  /api/reports/periods   { "periods": ["2026-09", ...] }
 *   GET  /api/reports/monthly?period=YYYY-MM
 *   GET  /api/reports/export?period=YYYY-MM   CSV of the report lines
 */
declare(strict_types=1);

namespace App\Controllers\Reporting;

use App\Audit;
use App\Auth;
use App\Csv;
use App\Reporting\CommissionImporter;
use App\Reporting\MonthlyReport;
use App\Request;
use App\Response;

final class ReportsController
{
    public function import(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('reporting');
        Request::require_csrf();

        $file = $_FILES['file'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            $err = is_array($file) ? (int) $file['error'] : UPLOAD_ERR_NO_FILE;
            $msg = in_array($err, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
                ? 'File too large for the server upload limit.'
                : 'No file received.';
            Response::json(['error' => $msg], 422);
        }
        $max = (int) ($GLOBALS['config']['reporting']['max_upload_bytes'] ?? 0);
        if ($max > 0 && (int) $file['size'] > $max) {
            Response::json(['error' => 'File too large.'], 422);
        }

        $periodRaw = $_POST['period'] ?? '';
        $period    = $periodRaw === '' ? null : Request::period($periodRaw);
        if ($periodRaw !== '' && $period === null) {
            Response::json(['error' => 'Month must be in YYYY-MM format.'], 422);
        }

        @set_time_limit(300);
        try {
            $result = (new CommissionImporter())->import((string) $file['tmp_name'], (string) $file['name'], $period, (int) $user['id']);
        } catch (\RuntimeException $e) {
            Audit::log('import.rejected', 'import', null, ['filename' => (string) $file['name'], 'reason' => $e->getMessage()]);
            Response::json(['error' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            error_log('[Import] ' . $e->getMessage());
            Response::json(['error' => 'Import failed. Please try again later.'], 500);
        }

        Audit::log('import.create', 'import', $result['import_id'], [
            'filename'         => (string) $file['name'],
            'periods'          => array_keys($result['periods']),
            'replaced_periods' => $result['replaced_periods'],
            'rows_raw'         => $result['rows_raw'],
            'rows_clean'       => $result['rows_clean'],
        ]);

        Response::json(['success' => true, 'result' => $result], 201);
    }

    public function periods(): void
    {
        Request::require_method('GET');
        Auth::require_access('reporting');
        Response::json(['periods' => (new MonthlyReport())->periods()]);
    }

    public function monthly(): void
    {
        Request::require_method('GET');
        Auth::require_access('reporting');

        $period = Request::period($_GET['period'] ?? null);
        if ($period === null) {
            Response::json(['error' => 'Month must be in YYYY-MM format.'], 422);
        }
        $report = (new MonthlyReport())->build($period);
        if ($report === null) {
            Response::json(['error' => 'No data imported for ' . $period . '.'], 404);
        }
        Response::json(['report' => $report]);
    }

    public function export(): void
    {
        Request::require_method('GET');
        Auth::require_access('reporting');

        $period = Request::period($_GET['period'] ?? null);
        $report = $period !== null ? (new MonthlyReport())->build($period) : null;
        if ($report === null) {
            Response::json(['error' => 'No data for this month.'], 404);
        }
        Audit::log('report.export', 'period', $period);

        $rows = [];
        foreach ($report['lines'] as $l) {
            $rows[] = [$l['label'], $l['txn'], $l['mur_txn'], $l['mur_vol'], $l['avg_ticket'], $l['fx_txn'],
                $l['prev_mur_vol'], $l['mom_vol'] === null ? null : round($l['mom_vol'], 4),
                $l['prev_txn'], $l['mom_txn'] === null ? null : round($l['mom_txn'], 4)];
        }
        foreach ($report['flags'] as $f) {
            $rows[] = ['FLAG: ' . $f];
        }
        Csv::download(
            "MIPS_report_$period.csv",
            ['line', 'txn', 'mur_txn', 'mur_vol', 'avg_ticket', 'fx_txn', 'prev_mur_vol', 'mom_vol', 'prev_txn', 'mom_txn'],
            $rows
        );
    }
}
