<?php
/**
 * POST /api/staffzen/leave — any member for their own leave; managing
 * others' leave, balances and settings needs owner/admin.
 *
 * Input (JSON body), by action:
 *   request       { "type_id", "start", "end", "half": "" | "am" | "pm", "note" }          own request, pending
 *   record        { "user_id", "type_id", "start", "end", "half", "note" }                 manager, approved at once
 *   decide        { "id", "approve": bool, "note" }
 *   cancel        { "id" }
 *   allowance     { "user_id", "type_id", "year", "days": "22" | "" }                      per-person yearly allowance
 *   work_days     { "days": "1111100" }                                                    Monday … Sunday
 *   type          { "id": 0|<id>, "name", "days": "20" | "" (not counted), "active": bool }
 *   delete_type   { "id" }
 *   holiday       { "day", "name" }
 *   del_holiday   { "day" }
 *
 * Responses: 200 { "success": true, "id"? } · 403 / 404 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\StaffZen;

use App\Request;
use App\Response;
use App\StaffZen\Leaves;
use App\StaffZen\Settings;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class LeaveController
{
    private const MANAGER_ACTIONS = ['allowance', 'work_days', 'type', 'delete_type', 'holiday', 'del_holiday'];

    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('staffzen');
        $data   = Request::json();
        $action = Request::str($data, 'action', 16);
        $id     = Request::int($data, 'id');
        $userId = (int) $user['id'];

        if (in_array($action, self::MANAGER_ACTIONS, true) && !Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut faire cela.'], 403);
        }

        $leave = static fn (): array => [
            'user_id' => Request::int($data, 'user_id'), 'type_id' => Request::int($data, 'type_id'),
            'start' => Request::str($data, 'start', 10), 'end' => Request::str($data, 'end', 10),
            'half' => Request::str($data, 'half', 2), 'note' => Request::str($data, 'note', 600),
        ];

        switch ($action) {
            case 'request':
            case 'record':
                [$id, $error] = Leaves::request($org, $userId, $leave(), $action === 'record');
                break;
            case 'decide':
                $error = Leaves::decide($org, $userId, $id, ($data['approve'] ?? false) === true, Request::str($data, 'note', 600));
                break;
            case 'cancel':
                $error = Leaves::cancel($org, $userId, $id);
                break;
            case 'allowance':
                $error = Leaves::setAllowance($org['id'], Request::int($data, 'user_id'), Request::int($data, 'type_id'), Request::int($data, 'year'), Request::str($data, 'days', 10));
                break;
            case 'work_days':
                $error = Settings::saveWorkDays($org['id'], Request::str($data, 'days', 7));
                break;
            case 'type':
                [$id, $error] = Settings::saveType($org['id'], $id, Request::str($data, 'name', 200), Request::str($data, 'days', 10), ($data['active'] ?? true) === true);
                break;
            case 'delete_type':
                $error = Settings::deleteType($org['id'], $id);
                break;
            case 'holiday':
                $error = Settings::addHoliday($org['id'], Request::str($data, 'day', 10), Request::str($data, 'name', 200));
                break;
            case 'del_holiday':
                $error = Settings::removeHoliday($org['id'], Request::str($data, 'day', 10));
                break;
            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
        if ($error !== null) {
            $status = str_contains($error, 'introuvable') ? 404 : (str_starts_with($error, 'Seul') ? 403 : 422);
            Response::json(['error' => $error], $status);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
