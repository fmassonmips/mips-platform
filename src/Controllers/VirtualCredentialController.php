<?php
/**
 * Virtual payment credentials & aliases (consumer self-service).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Rbac;
use App\Response;
use App\Services\VirtualCredentialService;
use App\Support\Http;
use RuntimeException;

final class VirtualCredentialController
{
    /** GET /api/credentials/overview */
    public function overview(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'credential.self.manage');
        Response::json(VirtualCredentialService::make()->overview((int) $user['id']));
    }

    /** POST /api/credentials/alias  { alias, alias_type? } */
    public function createAlias(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'credential.self.manage');

        $data = Http::jsonBody();
        try {
            $alias = VirtualCredentialService::make()->createAlias(
                (int) $user['id'],
                Http::string($data, 'alias'),
                Http::string($data, 'alias_type') ?: 'HANDLE',
            );
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        Response::json(['success' => true, 'alias' => $alias], 201);
    }

    /** POST /api/credentials/create  { type, token_reference?, expires_at? } */
    public function createCredential(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'credential.self.manage');

        $data = Http::jsonBody();
        try {
            $cred = VirtualCredentialService::make()->createCredential(
                (int) $user['id'],
                Http::string($data, 'type'),
                Http::string($data, 'token_reference') ?: null,
                Http::string($data, 'expires_at') ?: null,
            );
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        Response::json(['success' => true, 'credential' => $cred], 201);
    }
}
