<?php
/**
 * Compliance endpoints — REGULATED decisions performed by PassPass officers.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Rbac;
use App\Response;
use App\Services\ComplianceService;
use App\Support\Http;
use RuntimeException;

final class ComplianceController
{
    /** POST /api/compliance/decision  { merchant_reference, decision: APPROVE|REJECT, notes? } */
    public function decision(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'kyc.decide');

        $data     = Http::jsonBody();
        $ref      = Http::string($data, 'merchant_reference');
        $decision = Http::string($data, 'decision');
        $notes    = Http::string($data, 'notes');

        try {
            $merchant = ComplianceService::make()->decide($ref, (int) $user['id'], $decision, $notes !== '' ? $notes : null);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json([
            'success'           => true,
            'kyc_status'        => $merchant['kyc_status'],
            'compliance_status' => $merchant['compliance_status'],
        ]);
    }

    /** POST /api/compliance/score  { merchant_reference, score:0-100, factors?, notes? } */
    public function score(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'compliance.risk.score');

        $data    = Http::jsonBody();
        $ref     = Http::string($data, 'merchant_reference');
        $score   = Http::int($data, 'score') ?? -1;
        $factors = is_array($data['factors'] ?? null) ? $data['factors'] : [];
        $notes   = Http::string($data, 'notes');

        if ($score < 0) {
            Response::json(['error' => 'score (0-100) is required.'], 422);
        }

        try {
            $merchant = ComplianceService::make()->score($ref, (int) $user['id'], $score, $factors, $notes !== '' ? $notes : null);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json([
            'success'     => true,
            'risk_score'  => (int) $merchant['risk_score'],
            'risk_rating' => $merchant['risk_rating'],
        ]);
    }
}
