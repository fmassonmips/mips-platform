<?php
/**
 * POST /api/rendezvous/agenda — back office, any member of the organization.
 *
 * Input (JSON body):
 *   { "action": "book", "service_id", "staff_id", "date": "Y-m-d", "time": "HH:MM",
 *     "name", "phone", "email", "note" }
 *   { "action": "status", "id", "status": "done" | "no_show" | "cancelled" | "booked" }
 *
 * Responses: 200 { "success": true, "id" } · 404 / 409 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\RendezVous;

use App\RendezVous\Booking;
use App\RendezVous\Text;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;

final class AgendaController
{
    public function handle(): void
    {
        [, $org] = ModuleApi::context('rendezvous');
        $data    = Request::json();

        switch (Request::str($data, 'action', 16)) {
            case 'book':
                $in = ['service_id' => Request::int($data, 'service_id'), 'staff_id' => Request::int($data, 'staff_id')];
                foreach (['date' => 10, 'time' => 5, 'name' => 200, 'phone' => 40, 'email' => 254, 'note' => 600] as $f => $max) {
                    $in[$f] = Request::str($data, $f, $max);
                }
                [$appt, $error] = Booking::book($org['id'], $in, 'staff', null, Text::for('fr'));
                if ($error !== null) {
                    Response::json(['error' => $error], 409);
                }
                Response::json(['success' => true, 'id' => (int) $appt['id']]);

            case 'status':
                $error = Booking::setStatus($org['id'], Request::int($data, 'id'), Request::str($data, 'status', 16));
                if ($error !== null) {
                    Response::json(['error' => $error], 409);
                }
                Response::json(['success' => true]);

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
    }
}
