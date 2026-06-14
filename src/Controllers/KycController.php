<?php
/**
 * KYC submission endpoint (merchant submits for PassPass review).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Rbac;
use App\Response;
use App\Services\MerchantService;
use App\Support\Http;
use RuntimeException;

final class KycController
{
    /** POST /api/kyc/submit  { merchant_reference, documents:[{doc_type,file_reference}] } */
    public function submit(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'merchant.kyc.submit');

        $data = Http::jsonBody();
        $ref  = Http::string($data, 'merchant_reference');

        // A merchant may only submit KYC for their own merchant account.
        $svc  = MerchantService::make();
        $own  = $svc->findByUser((int) $user['id']);
        if ($own === null || (string) $own['merchant_reference'] !== $ref) {
            Response::json(['error' => 'Merchant not found for this account.'], 403);
        }

        $documents = is_array($data['documents'] ?? null) ? $data['documents'] : [];

        try {
            $merchant = $svc->submitKyc($ref, $documents);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json([
            'success'    => true,
            'kyc_status' => $merchant['kyc_status'],
            'message'    => 'KYC submitted to ' . ($GLOBALS['config']['platform']['regulated_entity'] ?? 'PassPass') . ' for review.',
        ]);
    }
}
