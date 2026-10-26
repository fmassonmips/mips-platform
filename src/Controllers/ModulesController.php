<?php
/**
 * /api/suite/modules
 *
 * GET  → the catalog with the caller's organization activation state.
 * POST → { "action": "activate" | "deactivate", "module": "<slug>" }
 *        Owner/admin only. Only 'available' modules can be activated.
 *
 * Responses:
 *   200 { "organization": {...}, "modules": [...] }
 *   401 { "error": "Unauthorized" }
 *   403 { "error": "..." }
 *   404 { "error": "Unknown module." }
 *   405 { "error": "Method Not Allowed" }
 *   409 { "error": "This module is not available yet." | "Your free trial of this app has ended." }
 *   419 { "error": "Invalid CSRF token." }
 *   422 { "error": "Invalid action." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Response;
use App\Suite\Catalog;
use App\Suite\Modules;
use App\Suite\Tenant;

final class ModulesController
{
    public function handle(): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? '';
        if ($method !== 'GET' && $method !== 'POST') {
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }

        $user = Auth::current_user();
        if ($user === null) {
            Response::json(['error' => 'Non autorisé'], 401);
        }
        $org = Tenant::forUser($user);

        if ($method === 'POST') {
            $this->mutate($org);
        }

        $this->respond($org);
    }

    /**
     * @param array{id:int,name:string,role:string} $org
     */
    private function mutate(array $org): void
    {
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Jeton de sécurité invalide, rechargez la page.'], 419);
        }
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut gérer les applications.'], 403);
        }

        $data   = json_decode((string) file_get_contents('php://input'), true);
        $action = is_array($data) && is_string($data['action'] ?? null) ? $data['action'] : '';
        $slug   = is_array($data) && is_string($data['module'] ?? null) ? $data['module'] : '';

        if (Catalog::get($slug) === null) {
            Response::json(['error' => 'Application inconnue.'], 404);
        }

        if ($action === 'activate') {
            if (!Catalog::isAvailable($slug)) {
                Response::json(['error' => 'Cette application n’est pas encore disponible.'], 409);
            }
            if (in_array($slug, Modules::trialEndedFor($org['id']), true)) {
                Response::json(['error' => 'Votre essai gratuit de cette application est terminé.'], 409);
            }
            Modules::activate($org['id'], $slug);
        } elseif ($action === 'deactivate') {
            Modules::deactivate($org['id'], $slug);
        } else {
            Response::json(['error' => 'Action invalide.'], 422);
        }
    }

    /**
     * @param array{id:int,name:string,role:string} $org
     */
    private function respond(array $org): never
    {
        $enabled = Modules::enabledFor($org['id']);
        $ended   = Modules::trialEndedFor($org['id']);

        $modules = [];
        foreach (Catalog::all() as $slug => $m) {
            $modules[] = [
                'slug'          => $slug,
                'name'          => $m['name'],
                'domain'        => $m['domain'],
                'tagline'       => $m['tagline'],
                'status'        => $m['status'],
                'enabled'       => isset($enabled[$slug]),
                'trial_ended'   => in_array($slug, $ended, true),
                'trial_ends_at' => $enabled[$slug]['trial_ends_at'] ?? null,
            ];
        }

        Response::json([
            'organization' => ['id' => $org['id'], 'name' => $org['name'], 'role' => $org['role']],
            'modules'      => $modules,
        ], 200);
    }
}
