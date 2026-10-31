<?php
/**
 * POST /api/suite/onboarding { "action": "done" } — hide the « Bien démarrer »
 * checklist (owner/admin). Responses: 200 · 401 / 403 / 405 / 419 / 422.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Request;
use App\Response;
use App\Suite\Onboarding;
use App\Suite\Tenant;

final class OnboardingController
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
            Response::json(['error' => 'Réservé au propriétaire et aux administrateurs.'], 403);
        }
        if (Request::str(Request::json(), 'action', 10) !== 'done') {
            Response::json(['error' => 'Action invalide.'], 422);
        }
        Onboarding::complete($org['id']);
        Response::json(['success' => true]);
    }
}
