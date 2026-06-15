<?php
/**
 * API-key management (merchant self-service, session-authenticated).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Services\ApiKeyService;
use App\Support\Http;

final class ApiKeyController
{
    /** POST /api/apikeys/create  { label? } — returns the secret ONCE. */
    public function create(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'apikey.self.manage');

        $merchant = $this->merchant((int) $user['id']);
        $data     = Http::jsonBody();
        $key      = ApiKeyService::make()->create((int) $merchant['id'], Http::string($data, 'label') ?: null);

        Response::json([
            'success' => true,
            'message' => 'Store the secret now — it will not be shown again.',
            'api_key' => $key,
        ], 201);
    }

    /** GET /api/apikeys/list */
    public function list(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'apikey.self.manage');

        $merchant = $this->merchant((int) $user['id']);
        Response::json(['keys' => ApiKeyService::make()->listForMerchant((int) $merchant['id'])]);
    }

    /** POST /api/apikeys/revoke  { key_id } */
    public function revoke(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'apikey.self.manage');

        $merchant = $this->merchant((int) $user['id']);
        $keyId    = Http::string(Http::jsonBody(), 'key_id');
        $ok       = ApiKeyService::make()->revoke((int) $merchant['id'], $keyId);

        Response::json(['success' => $ok], $ok ? 200 : 404);
    }

    /** @return array<string,mixed> */
    private function merchant(int $userId): array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM merchants WHERE user_id = :u ORDER BY id LIMIT 1');
        $stmt->execute([':u' => $userId]);
        $m = $stmt->fetch();
        if (!is_array($m)) {
            Response::json(['error' => 'No merchant account for this user.'], 422);
        }
        return $m;
    }
}
