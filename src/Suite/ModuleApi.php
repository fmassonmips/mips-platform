<?php
/**
 * Shared guard for a suite app's JSON endpoints: POST only, authenticated,
 * CSRF-checked, and the app enabled for the caller's organization.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Auth;
use App\Csrf;
use App\Response;

final class ModuleApi
{
    /**
     * @return array{0:array<string,mixed>,1:array{id:int,name:string,role:string}} [user, org]
     */
    public static function context(string $slug): array
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
        if (!Modules::isEnabled($org['id'], $slug)) {
            Response::json(['error' => (Catalog::get($slug)['name'] ?? 'This app') . ' is not enabled for your organization.'], 403);
        }
        return [$user, $org];
    }
}
