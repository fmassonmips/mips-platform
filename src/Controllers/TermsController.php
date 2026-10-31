<?php
/**
 * POST /api/auth/terms { "action": "accept" } — the logged-in user accepts the
 * terms of use and privacy policy in force (App\Legal::VERSION).
 * Responses: 200 · 401 / 405 / 419 / 422.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Legal;
use App\Request;
use App\Response;

final class TermsController
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
        if (Request::str(Request::json(), 'action', 10) !== 'accept') {
            Response::json(['error' => 'Action invalide.'], 422);
        }
        Legal::accept((int) $user['id']);
        Response::json(['success' => true, 'version' => Legal::VERSION]);
    }
}
