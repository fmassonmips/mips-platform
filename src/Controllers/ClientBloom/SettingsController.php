<?php
/**
 * POST /api/clientbloom/settings — loyalty program rules (owner/admin).
 *
 * Input (JSON body):
 *   { "cashback_rate": "5", "min_redeem": "100.00", "welcome_bonus": "0", "expiry_months": 12 }
 *
 * Responses:
 *   200 { "success": true }
 *   403 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\ClientBloom;

use App\ClientBloom\Settings;
use App\Facturo\Money;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class SettingsController
{
    public function handle(): void
    {
        [, $org] = ModuleApi::context('clientbloom');
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Only an owner or admin can change the program.'], 403);
        }
        $data = Request::json();

        $rate  = Money::parseRate(Request::str($data, 'cashback_rate', 10));
        $min   = Money::parseCents(Request::str($data, 'min_redeem', 20));
        $bonus = Money::parseCents(Request::str($data, 'welcome_bonus', 20));
        $exp   = Request::str($data, 'expiry_months', 5);
        if ($rate === null || $min === null || $bonus === null || !ctype_digit($exp)) {
            Response::json(['error' => 'Check the values: numbers only, at most 2 decimals.'], 422);
        }
        $settings = ['cashback_bp' => $rate, 'min_redeem_cents' => $min, 'welcome_bonus_cents' => $bonus, 'expiry_months' => (int) $exp];
        $error = Settings::validate($settings);
        if ($error !== null) {
            Response::json(['error' => $error], 422);
        }
        Settings::save($org['id'], $settings);
        Response::json(['success' => true]);
    }
}
