<?php
/**
 * Reconciliation endpoints (finance ops).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Services\ReconciliationService;
use App\Support\Http;
use RuntimeException;

final class ReconciliationController
{
    /**
     * POST /api/reconciliation/run
     * { merchant_reference?, bank_file?:[{reference,amount_minor}] }
     */
    public function run(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'reconciliation.manage');

        $data     = Http::jsonBody();
        $ref      = Http::string($data, 'merchant_reference');
        $bankFile = is_array($data['bank_file'] ?? null) ? $data['bank_file'] : null;

        try {
            $summary = ReconciliationService::make()->run($ref !== '' ? $ref : null, $bankFile, (int) $user['id']);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json(['success' => true, 'reconciliation' => $summary], 201);
    }

    /** GET /api/reconciliation/list[?batch=REC_...] */
    public function list(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'reconciliation.manage');

        $db    = Database::connection();
        $batch = isset($_GET['batch']) ? (string) $_GET['batch'] : '';

        if ($batch !== '') {
            Response::json(['items' => ReconciliationService::make()->items($batch)]);
        }

        $rows = $db->query('SELECT * FROM reconciliation_batches ORDER BY id DESC LIMIT 50')->fetchAll();
        Response::json(['batches' => $rows]);
    }
}
