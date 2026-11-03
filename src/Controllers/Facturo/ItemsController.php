<?php
/**
 * POST /api/facturo/items (owner/admin; every member can use the items in a draft)
 *
 * Input (JSON body):
 *   { "action": "save",   "id": 0|<id>, "name": "...", "unit_price": "1500.00", "tax_code": "TC01", "nature": "SERVICES" }
 *   { "action": "delete", "id": <id> }
 *
 * Responses: 200 { "success": true, "id": <id> } · 403 · 404 · 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\Facturo;

use App\Facturo\Api;
use App\Facturo\Items;
use App\Request;
use App\Response;
use App\Suite\Tenant;

final class ItemsController
{
    public function handle(): void
    {
        [, $org] = Api::context();
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Réservé au propriétaire et aux administrateurs : demandez-leur de modifier le catalogue.'], 403);
        }
        $data = Request::json();
        $id   = Request::int($data, 'id');

        switch (Request::str($data, 'action', 16)) {
            case 'save':
                [$fields, $error] = Items::validate([
                    'name'       => Request::str($data, 'name', 300),
                    'unit_price' => Request::str($data, 'unit_price', 30),
                    'tax_code'   => Request::str($data, 'tax_code', 8),
                    'nature'     => Request::str($data, 'nature', 16),
                ]);
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                [$savedId, $error] = Items::save($org['id'], $id, $fields);
                if ($error !== null) {
                    Response::json(['error' => $error], $error === 'Article introuvable.' ? 404 : 422);
                }
                Response::json(['success' => true, 'id' => $savedId]);

            case 'delete':
                if (!Items::delete($org['id'], $id)) {
                    Response::json(['error' => 'Article introuvable.'], 404);
                }
                Response::json(['success' => true, 'id' => $id]);

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
    }
}
