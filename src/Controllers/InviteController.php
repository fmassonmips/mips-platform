<?php
/**
 * POST /api/auth/invite — accept an invitation, no login needed.
 *
 * Input (JSON body): { "t": <token from the link>, "name", "password" }
 * The account is created (or reactivated) and the visitor is logged in.
 *
 * Responses: 200 { "success": true } · 405 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Legal;
use App\Request;
use App\Response;
use App\Suite\Team;

final class InviteController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Jeton de sécurité invalide, rechargez la page.'], 419);
        }
        $data = Request::json();
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if (($data['accept_terms'] ?? false) !== true) {
            Response::json(['error' => 'Pour rejoindre l’équipe, acceptez les conditions générales d’utilisation et la politique de confidentialité.'], 422);
        }
        [$user, $error] = Team::accept(Request::str($data, 't', 64), Request::str($data, 'name', 200), $password);
        if ($error !== null) {
            Response::json(['error' => $error], 422);
        }
        Legal::accept((int) $user['id']);
        Auth::login_user($user);
        Response::json(['success' => true]);
    }
}
