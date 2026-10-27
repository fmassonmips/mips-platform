<?php
/**
 * POST /api/rendezvous/setup — services, team and booking rules (owner/admin).
 *
 * Input (JSON body):
 *   { "action": "service", "id": 0|<id>, "name", "duration_min", "price", "active" }
 *   { "action": "staff",   "id": 0|<id>, "name", "active", "hours": { "1": "08:00-12:00, 13:00-17:00", … "7": "" } }
 *   { "action": "settings", "booking_enabled", "slot_step_min", "min_notice_min", "max_days_ahead",
 *     "cancel_notice_min", "notify_email", "intro" }
 *   { "action": "new_link" }   new public booking link; the old one stops working
 *
 * Responses: 200 { "success": true, "id"? } · 403 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\RendezVous;

use App\RendezVous\Services;
use App\RendezVous\Settings;
use App\RendezVous\Staff;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class SetupController
{
    public function handle(): void
    {
        [, $org] = ModuleApi::context('rendezvous');
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut modifier ces réglages.'], 403);
        }
        $data = Request::json();
        $id   = Request::int($data, 'id');

        switch (Request::str($data, 'action', 16)) {
            case 'service':
                [$savedId, $error] = Services::save($org['id'], $id, [
                    'name' => Request::str($data, 'name', 200), 'duration_min' => Request::int($data, 'duration_min'),
                    'price' => Request::str($data, 'price', 20), 'active' => ($data['active'] ?? false) === true,
                ]);
                break;

            case 'staff':
                $hours = is_array($data['hours'] ?? null) ? $data['hours'] : [];
                $clean = [];
                foreach (array_keys(Staff::WEEKDAYS) as $day) {
                    $clean[$day] = is_string($hours[(string) $day] ?? null) ? mb_substr($hours[(string) $day], 0, 200) : '';
                }
                [$savedId, $error] = Staff::save($org['id'], $id, Request::str($data, 'name', 200),
                    ($data['active'] ?? false) === true, $clean);
                break;

            case 'settings':
                $error = Settings::save($org['id'], [
                    'booking_enabled'   => ($data['booking_enabled'] ?? false) === true,
                    'slot_step_min'     => Request::int($data, 'slot_step_min'),
                    'min_notice_min'    => Request::int($data, 'min_notice_min'),
                    'max_days_ahead'    => Request::int($data, 'max_days_ahead'),
                    'cancel_notice_min' => Request::int($data, 'cancel_notice_min'),
                    'notify_email'      => Request::str($data, 'notify_email', 300),
                    'intro'             => Request::str($data, 'intro', 600),
                ]);
                $savedId = 0;
                break;

            case 'new_link':
                Settings::regenerateToken($org['id']);
                [$savedId, $error] = [0, null];
                break;

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
        if ($error !== null) {
            Response::json(['error' => $error], 422);
        }
        Response::json(['success' => true, 'id' => $savedId]);
    }
}
