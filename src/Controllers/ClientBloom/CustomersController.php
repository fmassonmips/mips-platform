<?php
/**
 * POST /api/clientbloom/customers
 *
 * Input (JSON body), by action:
 *   save  { "id": 0|<id>, "name", "phone", "email", "birthday", "tags", "marketing_consent": bool }
 *   note  { "id", "body" }
 *   card  { "id" }                    → { "url" } private loyalty card link
 *   erase { "id" }                    owner/admin; removes personal data, keeps the anonymous ledger
 *
 * Responses:
 *   200 { "success": true, "id": <id>, ... }
 *   403 / 409 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\ClientBloom;

use App\ClientBloom\Customers;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class CustomersController
{
    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('clientbloom');
        $data = Request::json();
        $id   = Request::int($data, 'id');

        switch (Request::str($data, 'action', 16)) {
            case 'save':
                [$fields, $error] = Customers::validate($data);
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                [$id, $error] = Customers::save($org['id'], (int) $user['id'], $id, $fields);
                $this->done($id, $error);

            case 'note':
                $body = is_string($data['body'] ?? null) ? $data['body'] : '';
                $this->done($id, Customers::addNote($org['id'], (int) $user['id'], $id, $body));

            case 'card':
                if (Customers::find($org['id'], $id) === null) {
                    Response::json(['error' => 'Client introuvable.'], 409);
                }
                $base = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/');
                Response::json(['success' => true, 'id' => $id,
                    'url' => $base . '/clientbloom/card.php?t=' . Customers::publicToken($org['id'], $id)]);

            case 'erase':
                if (!Tenant::canManage($org)) {
                    Response::json(['error' => 'Seul un propriétaire ou un administrateur peut effacer un client.'], 403);
                }
                $this->done($id, Customers::erase($org['id'], $id));

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
    }

    private function done(int $id, ?string $error): never
    {
        if ($error !== null) {
            Response::json(['error' => $error], 409);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
