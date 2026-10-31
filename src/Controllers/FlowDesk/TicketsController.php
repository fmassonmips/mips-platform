<?php
/**
 * POST /api/flowdesk/tickets — back office, any member of the organization.
 *
 * Input (JSON body):
 *   { "action": "create", "name", "email", "phone", "subject", "message" }
 *   { "action": "answer", "id", "kind": "reply" | "note", "body", "status"?: "" | "open" | "pending" | "resolved" | "closed" }
 *   { "action": "update", "id", "status"?, "priority"?, "assignee_id"? (0 = nobody) }
 *   { "action": "settings", "form_enabled", "notify_email", "intro" }   owner/admin
 *   { "action": "new_link" }                                            owner/admin
 *
 * Responses: 200 { "success": true, "id"? } · 403 / 404 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\FlowDesk;

use App\FlowDesk\Settings;
use App\FlowDesk\Text;
use App\FlowDesk\Tickets;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class TicketsController
{
    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('flowdesk');
        $data   = Request::json();
        $id     = Request::int($data, 'id');
        $action = Request::str($data, 'action', 16);

        if (in_array($action, ['settings', 'new_link'], true) && !Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut modifier ces réglages.'], 403);
        }

        switch ($action) {
            case 'create':
                $in = [];
                foreach (['name' => 200, 'email' => 300, 'phone' => 40, 'subject' => 300, 'message' => 12000] as $f => $max) {
                    $in[$f] = Request::str($data, $f, $max);
                }
                [$ticket, $error] = Tickets::create($org['id'], $in, 'staff', (int) $user['id'], null, self::staffText());
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                Response::json(['success' => true, 'id' => (int) $ticket['id']]);

            case 'answer':
                $error = Tickets::answer($org['id'], (int) $user['id'], $id, Request::str($data, 'kind', 8),
                    Request::str($data, 'body', 12000), Request::str($data, 'status', 10));
                break;

            case 'update':
                $error = Tickets::update($org['id'], $id,
                    array_key_exists('status', $data) ? Request::str($data, 'status', 10) : null,
                    array_key_exists('priority', $data) ? Request::str($data, 'priority', 10) : null,
                    array_key_exists('assignee_id', $data) ? Request::int($data, 'assignee_id') : null);
                break;

            case 'settings':
                $error = Settings::save($org['id'], ($data['form_enabled'] ?? false) === true,
                    Request::str($data, 'notify_email', 300), Request::str($data, 'intro', 600));
                break;

            case 'new_link':
                Settings::newLink($org['id']);
                $error = null;
                break;

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
        if ($error !== null) {
            Response::json(['error' => $error], str_contains($error, 'introuvable') ? 404 : 422);
        }
        Response::json(['success' => true, 'id' => $id]);
    }

    /**
     * Validation messages for the back office (the customer texts speak to "you").
     *
     * @return array<string,string>
     */
    private static function staffText(): array
    {
        return array_merge(Text::for('fr'), [
            'err_name' => 'Le nom du client est obligatoire.', 'err_contact' => 'E-mail du client invalide.',
            'err_message' => 'Décrivez la demande (10 000 caractères max.).',
        ]);
    }
}
