<?php
/**
 * POST /api/suite/closure — owner only.
 *   request { "password", "name" }   close the company, deleted after Closure::DELAY_DAYS days
 *   cancel  {}                        keep the company (until the deletion date)
 * Responses: 200 · 401 / 403 / 405 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\RateLimiter;
use App\Request;
use App\Response;
use App\Suite\Closure;
use App\Suite\Tenant;

final class ClosureController
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
        if ($org['role'] !== 'owner') {
            Response::json(['error' => 'Seul le propriétaire gère la fermeture du compte.'], 403);
        }
        $data = Request::json();
        switch (Request::str($data, 'action', 10)) {
            case 'request':
                // The password is checked: count failures like logins (a stolen session cannot guess it).
                $ip = Request::clientIp();
                $rl = $GLOBALS['config']['rate_limit'];
                if (RateLimiter::tooManyAttempts($ip, (string) $user['email'], (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
                    Response::json(['error' => 'Trop de tentatives. Veuillez réessayer plus tard.'], 429);
                }
                $error = Closure::request($user, $org, is_string($data['password'] ?? null) ? $data['password'] : '', Request::str($data, 'name', 200));
                if ($error === 'Mot de passe incorrect.') {
                    RateLimiter::record($ip, (string) $user['email'], false);
                }
                break;
            case 'cancel':
                $error = Closure::cancel($org['id']);
                break;
            default:
                $error = 'Action invalide.';
        }
        if ($error !== null) {
            Response::json(['error' => $error], 422);
        }
        Response::json(['success' => true]);
    }
}
