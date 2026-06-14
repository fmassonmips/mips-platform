<?php
/**
 * Settlement endpoints (finance ops, supervised by PassPass).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Services\SettlementService;
use App\Support\Http;
use App\Support\Money;
use RuntimeException;

final class SettlementController
{
    /** POST /api/settlements/create  { merchant_reference } */
    public function create(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'settlement.batch.manage');

        $data = Http::jsonBody();
        $ref  = Http::string($data, 'merchant_reference');

        try {
            $summary = SettlementService::make()->settleMerchant($ref, (int) $user['id']);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        $summary['net_display'] = Money::format((int) $summary['net_minor'], (string) $summary['currency']);
        Response::json(['success' => true, 'settlement' => $summary], 201);
    }

    /** GET /api/settlements/list[?merchant_reference=MER_...] */
    public function list(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'settlement.read.all');

        $db  = Database::connection();
        $ref = isset($_GET['merchant_reference']) ? (string) $_GET['merchant_reference'] : '';
        if ($ref !== '') {
            $stmt = $db->prepare(
                'SELECT s.* FROM settlements s
                   JOIN merchants m ON m.id = s.merchant_id
                  WHERE m.merchant_reference = :r ORDER BY s.id DESC'
            );
            $stmt->execute([':r' => $ref]);
        } else {
            $stmt = $db->query('SELECT * FROM settlements ORDER BY id DESC LIMIT 100');
        }

        Response::json(['settlements' => $stmt->fetchAll()]);
    }
}
