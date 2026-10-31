<?php
/**
 * POST /api/suite/team — company team (owner/admin).
 *
 * Input (JSON body), by action:
 *   invite  { "email", "role": "admin" | "member" }   → { "success": true, "url" } (link also e-mailed)
 *   revoke  { "id" }                                 pending invitation
 *   role    { "user_id", "role": "admin" | "member" } owner only
 *   remove  { "user_id" }
 *
 * Responses: 200 { "success": true } · 401 / 403 / 404 / 405 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Request;
use App\Response;
use App\Suite\Team;
use App\Suite\Tenant;

final class TeamController
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
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut gérer l’équipe.'], 403);
        }

        $data   = Request::json();
        $action = Request::str($data, 'action', 16);
        switch ($action) {
            case 'invite':
                [$url, $error] = Team::invite($org, $user, Request::str($data, 'email', 300), Request::str($data, 'role', 16));
                if ($error === null) {
                    Response::json(['success' => true, 'url' => $url]);
                }
                break;
            case 'revoke':
                $error = Team::revoke($org, Request::int($data, 'id'));
                break;
            case 'role':
                $error = Team::setRole($org, (int) $user['id'], Request::int($data, 'user_id'), Request::str($data, 'role', 16));
                break;
            case 'remove':
                $error = Team::remove($org, (int) $user['id'], Request::int($data, 'user_id'));
                break;
            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
        if ($error !== null) {
            $status = str_contains($error, 'introuvable') ? 404 : (str_starts_with($error, 'Seul') ? 403 : 422);
            Response::json(['error' => $error], $status);
        }
        Response::json(['success' => true]);
    }
}
