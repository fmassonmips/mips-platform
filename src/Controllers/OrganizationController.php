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
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }
        $user = Auth::current_user();
        if ($user === null) {
            Response::json(['error' => 'Non autorisé'], 401);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Jeton de sécurité invalide, rechargez la page.'], 419);
        }
        $org = Tenant::forUser($user);
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut modifier le profil de l’entreprise.'], 403);
        }

        $data    = Request::json();
        $profile = ['name' => Request::str($data, 'name', 1000)];
        if ($profile['name'] === '' || mb_strlen($profile['name']) > 160) {
            Response::json(['error' => 'Le nom de l’entreprise est obligatoire (160 caractères max.).'], 422);
        }
        foreach (Tenant::PROFILE_FIELDS as $field => $max) {
            $profile[$field] = Request::str($data, $field, 1000);
            if (mb_strlen($profile[$field]) > $max) {
                $labels = ['legal_name' => 'Raison sociale', 'address' => 'Adresse', 'brn' => 'BRN', 'vat_number' => 'N° TVA', 'email' => 'E-mail', 'phone' => 'Téléphone'];
                Response::json(['error' => ($labels[$field] ?? $field) . ' : trop long.'], 422);
            }
        }
        if ($profile['email'] !== '' && !filter_var($profile['email'], FILTER_VALIDATE_EMAIL)) {
            Response::json(['error' => 'E-mail invalide.'], 422);
        }

        Tenant::updateProfile($org['id'], $profile);
        Response::json(['success' => true]);
    }
}
