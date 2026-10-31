<?php
/**
 * POST /api/bookora/public — no login (CSRF token of the page).
 *
 * Input (JSON body), by action:
 *   search  { "o": <link token>, "check_in", "check_out", "guests" }     → { "units": [{ unit_id, available, reason | nights, total, lines }] }
 *   book    { "o", "unit_id", "check_in", "check_out", "guests", "name", "phone", "email", "note", "website": "" }
 *                                                                          → { "booking_url" }
 *   cancel  { "t": <booking token> }                                       guest cancels a request not yet confirmed
 *
 * Responses: 200 · 404 / 409 / 419 / 422 { "error": "..." } (company language)
 */
declare(strict_types=1);

namespace App\Controllers\Bookora;

use App\Bookora\Bookings;
use App\Bookora\Settings;
use App\Bookora\Text;
use App\Csrf;
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
        $action = Request::str($data, 'action', 10);

        if ($action === 'cancel') {
            $found = Bookings::findByToken(Request::str($data, 't', 60));
            $t     = Text::for($found !== null ? Tenant::profile($found[0])['document_language'] : 'fr');
            if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
                Response::json(['error' => $t['err_session']], 419);
            }
            if ($found === null) {
                Response::json(['error' => $t['not_found']], 404);
            }
            if (Bookings::cancel($found[0], (int) $found[1]['id'], true) !== null) {
                Response::json(['error' => $t['err_cancel']], 422);
            }
            Response::json(['success' => true]);
        }

        $orgId = Settings::orgByToken(Request::str($data, 'o', 40));
        $t     = Text::for($orgId !== null ? Tenant::profile($orgId)['document_language'] : 'fr');
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => $t['err_session']], 419);
        }
        if ($orgId === null) {
            Response::json(['error' => $t['not_found']], 404);
        }
        if (!Modules::isEnabled($orgId, 'bookora') || !Settings::get($orgId)['booking_open']) {
            Response::json(['error' => $t['closed']], 409);
        }
        $in  = Request::str($data, 'check_in', 10);
        $out = Request::str($data, 'check_out', 10);
        $g   = Request::int($data, 'guests');

        if ($action === 'search') {
            [$units, $error] = Bookings::search($orgId, $in, $out, $g, $t);
            if ($error !== null) {
                Response::json(['error' => $error], 422);
            }
            Response::json(['success' => true, 'units' => $units]);
        }
        if ($action !== 'book') {
            Response::json(['error' => 'Invalid action.'], 422);
        }
        // Bots fill every field; people never see this one.
        if (Request::str($data, 'website', 200) !== '') {
            Response::json(['success' => true, 'booking_url' => null]);
        }
        [$b, $error] = Bookings::place($orgId, [
            'unit_id' => Request::int($data, 'unit_id'), 'check_in' => $in, 'check_out' => $out, 'guests' => $g,
            'name' => Request::str($data, 'name', 200), 'phone' => Request::str($data, 'phone', 40),
            'email' => Request::str($data, 'email', 300), 'note' => Request::str($data, 'note', 600),
        ], $t, false, Request::clientIp());
        if ($error !== null) {
            Response::json(['error' => $error], $error === $t['err_limit'] || $error === $t['err_taken'] ? 409 : 422);
        }
        Response::json(['success' => true, 'booking_url' => '/bookora/b.php?t=' . $b['token'] . '&new=1']);
    }
}
