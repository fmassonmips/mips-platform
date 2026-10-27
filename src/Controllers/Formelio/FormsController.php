<?php
/**
 * POST /api/formelio/forms — any member creates and edits forms; owner/admin delete.
 *
 * Input (JSON body):
 *   { "action": "create", "template": "satisfaction" | "contact" | "event" | "" }
 *   { "action": "save", "id", "title", "description", "thank_you", "notify_email",
 *     "fields": [{ "id"?, "type", "label", "required", "options": [] }] }
 *   { "action": "status", "id", "status": "draft" | "open" | "closed" }
 *   { "action": "new_link", "id" }
 *   { "action": "delete", "id" }                 owner/admin; deletes the responses too
 *   { "action": "delete_response", "id" }        owner/admin
 *
 * Responses: 200 { "success": true, "id"? } · 403 / 404 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\Formelio;

use App\Formelio\Forms;
use App\Formelio\Responses;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class FormsController
{
    public function handle(): void
    {
        [, $org] = ModuleApi::context('formelio');
        $data    = Request::json();
        $id      = Request::int($data, 'id');
        $action  = Request::str($data, 'action', 20);

        if (in_array($action, ['delete', 'delete_response'], true) && !Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut supprimer.'], 403);
        }

        switch ($action) {
            case 'create':
                Response::json(['success' => true, 'id' => Forms::create($org['id'], Request::str($data, 'template', 20))]);

            case 'save':
                $error = Forms::save($org['id'], $id, [
                    'title' => Request::str($data, 'title', 300), 'description' => Request::str($data, 'description', 1200),
                    'thank_you' => Request::str($data, 'thank_you', 600), 'notify_email' => Request::str($data, 'notify_email', 300),
                    'fields' => is_array($data['fields'] ?? null) ? $data['fields'] : [],
                ]);
                break;

            case 'status':
                $error = Forms::setStatus($org['id'], $id, Request::str($data, 'status', 10));
                break;

            case 'new_link':
                $error = Forms::find($org['id'], $id) === null ? 'Formulaire introuvable.' : null;
                if ($error === null) {
                    Forms::newLink($org['id'], $id);
                }
                break;

            case 'delete':
                $error = Forms::delete($org['id'], $id);
                break;

            case 'delete_response':
                $error = Responses::delete($org['id'], $id);
                break;

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
        if ($error !== null) {
            Response::json(['error' => $error], str_contains($error, 'introuvable') ? 404 : 422);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
