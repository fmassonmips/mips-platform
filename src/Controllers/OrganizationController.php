<?php
/**
 * POST /api/suite/organization
 *
 * Updates the company profile (owner/admin). Input (JSON body):
 *   { "name", "legal_name", "address", "brn", "vat_number", "email", "phone" }
 *
 * Responses:
 *   200 { "success": true }
 *   401 / 403 / 405 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Request;
use App\Response;
use App\Suite\Tenant;

final class OrganizationController
{
    public function handle(): void
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
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Only an owner or admin can edit the company profile.'], 403);
        }

        $data    = Request::json();
        $profile = ['name' => Request::str($data, 'name', 1000)];
        if ($profile['name'] === '' || mb_strlen($profile['name']) > 160) {
            Response::json(['error' => 'Organization name is required (max 160 characters).'], 422);
        }
        foreach (Tenant::PROFILE_FIELDS as $field => $max) {
            $profile[$field] = Request::str($data, $field, 1000);
            if (mb_strlen($profile[$field]) > $max) {
                Response::json(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is too long.'], 422);
            }
        }
        if ($profile['email'] !== '' && !filter_var($profile['email'], FILTER_VALIDATE_EMAIL)) {
            Response::json(['error' => 'Email is invalid.'], 422);
        }

        Tenant::updateProfile($org['id'], $profile);
        Response::json(['success' => true]);
    }
}
