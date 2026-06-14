<?php
/**
 * Merchant onboarding endpoints (technology layer over the regulated PSP).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Services\MerchantService;
use App\Support\Http;
use RuntimeException;

final class MerchantController
{
    /** POST /api/merchants/create */
    public function create(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'merchant.self.update');

        $data = Http::jsonBody();
        try {
            $merchant = MerchantService::make()->create((int) $user['id'], $data);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json(['success' => true, 'merchant' => $this->present($merchant)], 201);
    }

    /** GET /api/merchants/show[?ref=MER_...] — defaults to the caller's merchant. */
    public function show(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();

        $svc = MerchantService::make();
        $ref = isset($_GET['ref']) ? (string) $_GET['ref'] : '';

        if ($ref !== '') {
            Rbac::require($user, 'merchant.read.all');
            $merchant = $svc->findByReference($ref);
        } else {
            Rbac::require($user, 'merchant.self.read');
            $merchant = $svc->findByUser((int) $user['id']);
        }

        if ($merchant === null) {
            Response::json(['error' => 'Merchant not found.'], 404);
        }
        Response::json(['merchant' => $this->present($merchant)]);
    }

    /** GET /api/merchants/pending — compliance queue of merchants awaiting review. */
    public function pending(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'kyc.read.all');

        $stmt = Database::connection()->query(
            "SELECT * FROM merchants WHERE kyc_status IN ('SUBMITTED','REVIEW') ORDER BY updated_at DESC"
        );
        $rows = array_map([$this, 'present'], $stmt->fetchAll());
        Response::json(['merchants' => $rows]);
    }

    /**
     * @param array<string,mixed> $m
     * @return array<string,mixed>
     */
    private function present(array $m): array
    {
        return [
            'merchant_reference'    => $m['merchant_reference'],
            'regulated_entity'      => $m['regulated_entity'],
            'regulated_merchant_id' => $m['regulated_merchant_id'],
            'legal_name'            => $m['legal_name'],
            'trading_name'          => $m['trading_name'],
            'kyc_status'            => $m['kyc_status'],
            'compliance_status'     => $m['compliance_status'],
            'risk_rating'           => $m['risk_rating'],
            'risk_score'            => $m['risk_score'] !== null ? (int) $m['risk_score'] : null,
            'settlement_account'    => $m['settlement_account'],
            'created_at'            => $m['created_at'],
        ];
    }
}
