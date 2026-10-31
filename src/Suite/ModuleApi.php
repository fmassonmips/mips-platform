<?php
/**
 * Shared guard for a suite app's JSON endpoints: POST only, authenticated,
 * CSRF-checked, and the app enabled for the caller's organization. Every
 * endpoint writes, so an app whose trial is over (read-only) is refused here.
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
        if (!Modules::isEnabled($org['id'], $slug)) {
            if (Modules::isReadOnly($org['id'], $slug)) {
                Response::json(['error' => 'L’essai gratuit de ' . (Catalog::get($slug)['name'] ?? 'cette application')
                    . ' est terminé : l’application est en lecture seule. Passez à l’abonnement pour continuer à l’utiliser.', 'read_only' => true], 403);
            }
            Response::json(['error' => (Catalog::get($slug)['name'] ?? 'Cette application') . ' n’est pas activée pour votre entreprise.'], 403);
        }
        return [$user, $org];
    }
}
