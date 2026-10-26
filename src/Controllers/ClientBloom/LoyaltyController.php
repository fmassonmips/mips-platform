<?php
/**
 * POST /api/clientbloom/loyalty
 *
 * Input (JSON body), by action:
 *   lookup   { "phone" }                                   → { "customer": {...}|null }
 *   checkout { "id", "amount", "redeem", "reference" }     amounts as "1234.50"
 *   adjust   { "id", "amount", "reason" }                  owner/admin; signed amount
 *   reverse  { "transaction_id" }                          owner/admin
 *
 * Responses:
 *   200 { "success": true, ... }
 *   403 / 409 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\ClientBloom;

use App\ClientBloom\Customers;
use App\ClientBloom\Ledger;
use App\Facturo\Money;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class LoyaltyController
{
    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('clientbloom');
        $data = Request::json();
        $id   = Request::int($data, 'id');

        switch (Request::str($data, 'action', 16)) {
            case 'lookup':
                $c = Customers::findByPhone($org['id'], Request::str($data, 'phone', 40));
                Response::json(['success' => true, 'customer' => $c === null ? null : [
                    'id'            => (int) $c['id'],
                    'name'          => (string) $c['name'],
                    'phone'         => (string) $c['phone'],
                    'balance_cents' => (int) $c['balance_cents'],
                    'balance'       => Money::format((int) $c['balance_cents'], 'MUR'),
                    'visits'        => (int) $c['visits'],
                    'last_visit_at' => $c['last_visit_at'],
                ]]);

            case 'checkout':
                $amount = Money::parseCents(Request::str($data, 'amount', 20));
                $redeemRaw = Request::str($data, 'redeem', 20);
                $redeem = $redeemRaw === '' ? 0 : Money::parseCents($redeemRaw);
                if ($amount === null || $redeem === null) {
                    Response::json(['error' => 'Les montants doivent être des nombres avec 2 décimales au plus.'], 422);
                }
                [$result, $error] = Ledger::checkout($org['id'], (int) $user['id'], $id, $amount, $redeem, Request::str($data, 'reference', 100));
                if ($error !== null) {
                    Response::json(['error' => $error], 409);
                }
                Response::json(['success' => true, 'id' => $id,
                    'earned'   => Money::format($result['earned'], 'MUR'),
                    'redeemed' => Money::format($result['redeemed'], 'MUR'),
                    'redeemed_cents' => $result['redeemed'],
                    'balance'  => Money::format($result['balance'], 'MUR')]);

            case 'adjust':
                $this->requireManager($org);
                $amount = Money::parseCents(Request::str($data, 'amount', 20));
                if ($amount === null) {
                    Response::json(['error' => 'Le montant doit être un nombre avec 2 décimales au plus.'], 422);
                }
                $this->done($id, Ledger::adjust($org['id'], (int) $user['id'], $id, $amount, Request::str($data, 'reason', 200)));

            case 'reverse':
                $this->requireManager($org);
                $this->done($id, Ledger::reverse($org['id'], (int) $user['id'], Request::int($data, 'transaction_id')));

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
    }

    /**
     * @param array{role:string} $org
     */
    private function requireManager(array $org): void
    {
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou un administrateur peut corriger le cashback.'], 403);
        }
    }

    private function done(int $id, ?string $error): never
    {
        if ($error !== null) {
            Response::json(['error' => $error], 409);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
