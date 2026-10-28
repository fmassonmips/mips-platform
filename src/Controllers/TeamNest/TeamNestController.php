<?php
/**
 * POST /api/teamnest/tasks — any member of the organization; billing needs owner/admin.
 *
 * Input (JSON body), by action:
 *   project      { "id": 0|<id>, "name", "description", "client_id", "hourly_rate" }
 *   archive      { "id", "archived": bool }
 *   bill         { "id" }       unbilled time → draft Facturo invoice (owner/admin, Facturo active)
 *   task         { "id": 0|<id>, "project_id", "title", "description", "status", "priority", "assignee_id", "due_date" }
 *   move         { "id", "status" }
 *   delete_task  { "id" }
 *   time         { "task_id", "duration": "1h30", "date", "note" }
 *   delete_time  { "id" }
 *   from_ticket  { "ticket_id", "project_id", "title" }   FlowDesk ticket → task
 *
 * Responses: 200 { "success": true, "id"? } · 403 / 404 / 409 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\TeamNest;

use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Modules;
use App\Suite\Tenant;
use App\TeamNest\Projects;
use App\TeamNest\Tasks;

final class TeamNestController
{
    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('teamnest');
        $data   = Request::json();
        $id     = Request::int($data, 'id');
        $userId = (int) $user['id'];

        switch (Request::str($data, 'action', 16)) {
            case 'project':
                [$id, $error] = Projects::save($org['id'], $id, [
                    'name' => Request::str($data, 'name', 300), 'description' => Request::str($data, 'description', 2500),
                    'client_id' => Request::int($data, 'client_id'), 'hourly_rate' => Request::str($data, 'hourly_rate', 20),
                ]);
                break;

            case 'archive':
                $error = Projects::setArchived($org['id'], $id, ($data['archived'] ?? false) === true);
                break;

            case 'bill':
                if (!Tenant::canManage($org)) {
                    Response::json(['error' => 'Seul un propriétaire ou administrateur peut facturer.'], 403);
                }
                if (!Modules::isEnabled($org['id'], 'facturo')) {
                    Response::json(['error' => 'Activez Facturo pour facturer le temps passé.'], 409);
                }
                [$invoiceId, $error] = Projects::bill($org['id'], $userId, $id);
                if ($error === null) {
                    Response::json(['success' => true, 'id' => $invoiceId]);
                }
                break;

            case 'task':
                [$id, $error] = Tasks::save($org['id'], $userId, $id, self::taskInput($data));
                break;

            case 'move':
                $error = Tasks::move($org['id'], $id, Request::str($data, 'status', 8));
                break;

            case 'delete_task':
                $error = Tasks::delete($org['id'], $id);
                break;

            case 'time':
                $error = Tasks::addTime($org['id'], $userId, Request::int($data, 'task_id'), Request::str($data, 'duration', 20),
                    Request::str($data, 'date', 10), Request::str($data, 'note', 300));
                break;

            case 'delete_time':
                $error = Tasks::deleteTime($org['id'], $id);
                break;

            case 'from_ticket':
                $ticket = Modules::isEnabled($org['id'], 'flowdesk') ? \App\FlowDesk\Tickets::find($org['id'], Request::int($data, 'ticket_id')) : null;
                if ($ticket === null) {
                    Response::json(['error' => 'Ticket introuvable.'], 404);
                }
                [$id, $error] = Tasks::save($org['id'], $userId, 0, [
                    'project_id' => Request::int($data, 'project_id'), 'title' => Request::str($data, 'title', 300),
                    'description' => 'Ticket #' . $ticket['number'] . ' — ' . $ticket['customer_name'], 'status' => 'todo',
                    'priority' => in_array($ticket['priority'], ['high', 'urgent'], true) ? 'high' : 'normal',
                    'assignee_id' => $userId, 'due_date' => '', 'flowdesk_ticket_id' => (int) $ticket['id'],
                ]);
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
     * @param array<string,mixed> $data
     * @return array<string,mixed>
     */
    private static function taskInput(array $data): array
    {
        $in = ['project_id' => Request::int($data, 'project_id'), 'assignee_id' => Request::int($data, 'assignee_id')];
        foreach (['title' => 300, 'description' => 12000, 'status' => 8, 'priority' => 8, 'due_date' => 10] as $f => $max) {
            $in[$f] = Request::str($data, $f, $max);
        }
        if ($in['status'] === '') {
            unset($in['status']);
        }
        if ($in['priority'] === '') {
            $in['priority'] = 'normal';
        }
        if ($in['project_id'] === 0) {
            unset($in['project_id']);
        }
        return $in;
    }
}
