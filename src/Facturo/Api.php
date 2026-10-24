<?php
/**
 * Shared guard for Facturo JSON endpoints: POST only, authenticated,
 * CSRF-checked, and Facturo enabled for the caller's organization.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Auth;
use App\Csrf;
use App\Response;
use App\Suite\Modules;
use App\Suite\Tenant;

final class Api
{
    /**
     * @return array{0:array<string,mixed>,1:array{id:int,name:string,role:string}} [user, org]
     */
    public static function context(): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        $user = Auth::current_user();
        if ($user === null) {
            Response::json(['error' => 'Unauthorized'], 401);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }
        $org = Tenant::forUser($user);
        if (!Modules::isEnabled($org['id'], 'facturo')) {
            Response::json(['error' => 'Facturo is not enabled for your organization.'], 403);
        }
        return [$user, $org];
    }
}
