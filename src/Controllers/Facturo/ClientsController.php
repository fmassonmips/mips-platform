<?php
/**
 * POST /api/facturo/clients
 *
 * Input (JSON body):
 *   { "action": "save",   "id": 0|<id>, "name": "...", "email": "...", ... }
 *   { "action": "delete", "id": <id> }
 *
 * Responses:
 *   200 { "success": true, "id": <id> }
 *   404 { "error": "Client not found." }
 *   409 { "error": "..." }        client still used by documents
 *   422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\Facturo;

use App\Facturo\Api;
use App\Facturo\Clients;
use App\Request;
use App\Response;

final class ClientsController
{
    public function handle(): void
    {
        [, $org] = Api::context();
        $data    = Request::json();
        $id      = Request::int($data, 'id');

        switch (Request::str($data, 'action', 16)) {
            case 'save':
                $input = [];
                foreach (array_keys(Clients::FIELDS) as $field) {
                    $input[$field] = Request::str($data, $field, 1000);
                }
                [$fields, $error] = Clients::validate($input);
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                $savedId = Clients::save($org['id'], $id, $fields);
                if ($savedId === null) {
                    Response::json(['error' => 'Client not found.'], 404);
                }
                Response::json(['success' => true, 'id' => $savedId]);

            case 'delete':
                $error = Clients::delete($org['id'], $id);
                if ($error !== null) {
                    Response::json(['error' => $error], 409);
                }
                Response::json(['success' => true, 'id' => $id]);

            default:
                Response::json(['error' => 'Invalid action.'], 422);
        }
    }
}
