<?php
/**
 * POST /api/rendezvous/public — customers, no login (CSRF token of the public page).
 *
 * Input (JSON body):
 *   { "action": "slots",  "o": <booking link token>, "service_id", "staff_id" (0 = anyone), "date" }
 *   { "action": "book",   "o", "service_id", "staff_id", "date", "time", "name", "phone", "email", "note" }
 *   { "action": "cancel", "t": <appointment token> }
 *
 * Responses:
 *   200 { "slots": [{ "time": "09:15" }] } | { "success": true, "manage_url" } | { "success": true }
 *   404 / 409 / 419 / 422 { "error": "..." }   (in the company's document language)
 */
declare(strict_types=1);

namespace App\Controllers\RendezVous;

use App\Csrf;
use App\RendezVous\Booking;
use App\RendezVous\Settings;
use App\RendezVous\Text;
use App\Request;
use App\Response;
use App\Suite\Modules;
use App\Suite\Tenant;

final class PublicController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        $data   = Request::json();
        $action = Request::str($data, 'action', 16);

        if ($action === 'cancel') {
            $found = Booking::findByToken(Request::str($data, 't', 60));
            $t     = Text::for($found !== null ? Tenant::profile($found[0])['document_language'] : 'fr');
            $this->checkCsrf($t);
            $error = Booking::cancelByToken(Request::str($data, 't', 60), $t);
            if ($error !== null) {
                Response::json(['error' => $error], 409);
            }
            Response::json(['success' => true]);
        }

        $orgId = Settings::orgByToken(Request::str($data, 'o', 40));
        $t     = Text::for($orgId !== null ? Tenant::profile($orgId)['document_language'] : 'fr');
        $this->checkCsrf($t);
        if ($orgId === null) {
            Response::json(['error' => $t['not_found']], 404);
        }
        if (!Modules::isEnabled($orgId, 'rendezvous') || !Settings::get($orgId)['booking_enabled']) {
            Response::json(['error' => $t['closed']], 409);
        }

        $serviceId = Request::int($data, 'service_id');
        $staffId   = Request::int($data, 'staff_id');
        $date      = Request::str($data, 'date', 10);

        switch ($action) {
            case 'slots':
                if (!Booking::validDate($date)) {
                    Response::json(['error' => $t['err_date']], 422);
                }
                $slots = array_map(static fn (array $s): array => ['time' => $s['time']],
                    Booking::slots($orgId, $serviceId, $staffId, $date));
                Response::json(['slots' => $slots]);

            case 'book':
                $in = ['service_id' => $serviceId, 'staff_id' => $staffId, 'date' => $date];
                foreach (['time' => 5, 'name' => 200, 'phone' => 40, 'email' => 254, 'note' => 600] as $f => $max) {
                    $in[$f] = Request::str($data, $f, $max);
                }
                [$appt, $error] = Booking::book($orgId, $in, 'online', Request::clientIp(), $t);
                if ($error !== null) {
                    Response::json(['error' => $error], 409);
                }
                Response::json(['success' => true, 'manage_url' => '/rendezvous/manage.php?t=' . $appt['token']]);

            default:
                Response::json(['error' => 'Invalid action.'], 422);
        }
    }

    /**
     * @param array<string,string> $t
     */
    private function checkCsrf(array $t): void
    {
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => $t['err_session']], 419);
        }
    }
}
