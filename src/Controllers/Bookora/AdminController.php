<?php
/**
 * POST /api/bookora/admin — back office. Bookings: any member; places,
 * calendars, settings and invoices: owner/admin.
 *
 * Input (JSON body), by action:
 *   unit         { "id": 0|<id>, "name", "description", "price" (per night, VAT incl.), "tax_code", "capacity", "min_nights", "active", "image" }
 *   delete_unit  { "id" }
 *   season       { "unit_id", "label", "start", "end" (last night), "price" }      del_season { "id" }
 *   block        { "unit_id", "start", "end" (last night), "reason" }             del_block  { "id" }
 *   ical_url     { "unit_id", "url" }      ical_sync { "unit_id" }      ical_token { "unit_id" }
 *   settings     { "booking_open", "intro", "checkin_time", "checkout_time", "deposit_percent", "hold_hours",
 *                  "bank_details", "juice_number", "notify_email" }
 *   new_link     {}
 *   booking      { "unit_id", "check_in", "check_out", "guests", "name", "phone", "email", "note" }   typed by the team, confirmed
 *   confirm      { "id" }    cancel { "id" }    deposit { "id", "on": bool }    paid { "id", "on": bool }
 *   invoice      { "id" }    draft Facturo invoice (Facturo active)
 *
 * Responses: 200 { "success": true, "id"?, "events"?, "warning"? } · 403 / 404 / 409 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\Bookora;

use App\Bookora\Bookings;
use App\Bookora\Ical;
use App\Bookora\Settings;
use App\Bookora\Text;
use App\Bookora\Units;
use App\Request;
use App\Response;
use App\Suite\ModuleApi;
use App\Suite\Modules;
use App\Suite\Tenant;

final class AdminController
{
    private const MANAGER_ACTIONS = ['unit', 'delete_unit', 'season', 'del_season', 'block', 'del_block', 'ical_url', 'ical_sync', 'ical_token',
                                     'settings', 'new_link', 'invoice'];

    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('bookora');
        $data   = Request::json();
        $id     = Request::int($data, 'id');
        $unitId = Request::int($data, 'unit_id');
        $action = Request::str($data, 'action', 16);
        $on     = ($data['on'] ?? false) === true;

        if (in_array($action, self::MANAGER_ACTIONS, true) && !Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut faire cela.'], 403);
        }

        switch ($action) {
            case 'unit':
                [$id, $error] = Units::save($org['id'], $id, [
                    'name' => Request::str($data, 'name', 300), 'description' => Request::str($data, 'description', 2500),
                    'price' => Request::str($data, 'price', 20), 'tax_code' => Request::str($data, 'tax_code', 4),
                    'capacity' => Request::str($data, 'capacity', 4), 'min_nights' => Request::str($data, 'min_nights', 4),
                    'active' => ($data['active'] ?? false) === true, 'image' => is_string($data['image'] ?? null) ? $data['image'] : '',
                ]);
                break;
            case 'delete_unit':
                $error = Units::delete($org['id'], $id);
                break;
            case 'season':
                $error = Units::addSeason($org['id'], $unitId, Request::str($data, 'label', 100), Request::str($data, 'start', 10),
                    Request::str($data, 'end', 10), Request::str($data, 'price', 20));
                break;
            case 'del_season':
                $error = Units::deleteSeason($org['id'], $id);
                break;
            case 'block':
                $error = Units::addBlock($org['id'], $unitId, Request::str($data, 'start', 10), Request::str($data, 'end', 10), Request::str($data, 'reason', 300));
                break;
            case 'del_block':
                $error = Units::deleteBlock($org['id'], $id);
                break;
            case 'ical_url':
                $error = Units::setIcalUrl($org['id'], $unitId, Request::str($data, 'url', 600));
                break;
            case 'ical_sync':
                $unit = Units::find($org['id'], $unitId);
                if ($unit === null || ($unit['ical_import_url'] ?? null) === null) {
                    Response::json(['error' => 'Aucun calendrier à importer pour ce logement.'], 422);
                }
                if ($unit['ical_synced_at'] !== null && strtotime((string) $unit['ical_synced_at']) > strtotime(\App\RendezVous\Booking::now()->format('Y-m-d H:i:s')) - 60) {
                    Response::json(['error' => 'Synchronisation faite il y a moins d’une minute : réessayez dans un instant.'], 429);
                }
                [$events, $warning] = Ical::sync($unit);
                Response::json(['success' => true, 'events' => $events, 'warning' => $warning]);
            case 'ical_token':
                $error = Units::newIcalToken($org['id'], $unitId);
                break;
            case 'settings':
                $in = ['booking_open' => ($data['booking_open'] ?? false) === true];
                foreach (['intro' => 600, 'checkin_time' => 5, 'checkout_time' => 5, 'deposit_percent' => 3, 'hold_hours' => 3,
                          'bank_details' => 400, 'juice_number' => 60, 'notify_email' => 300] as $f => $max) {
                    $in[$f] = Request::str($data, $f, $max);
                }
                $error = Settings::save($org['id'], $in);
                break;
            case 'new_link':
                Settings::newLink($org['id']);
                $error = null;
                break;
            case 'booking':
                $t = Text::for(Bookings::language($org['id']));
                [$b, $error] = Bookings::place($org['id'], [
                    'unit_id' => $unitId, 'check_in' => Request::str($data, 'check_in', 10), 'check_out' => Request::str($data, 'check_out', 10),
                    'guests' => Request::int($data, 'guests'), 'name' => Request::str($data, 'name', 200), 'phone' => Request::str($data, 'phone', 40),
                    'email' => Request::str($data, 'email', 300), 'note' => Request::str($data, 'note', 600),
                ], $t, true, null);
                $id = $b !== null ? (int) $b['id'] : 0;
                break;
            case 'confirm':
                $error = Bookings::confirm($org['id'], $id);
                break;
            case 'cancel':
                $error = Bookings::cancel($org['id'], $id, false);
                break;
            case 'deposit':
            case 'paid':
                $error = Bookings::setPayment($org['id'], $id, $action, $on);
                break;
            case 'invoice':
                if (!Modules::isEnabled($org['id'], 'facturo')) {
                    Response::json(['error' => 'Activez Facturo pour facturer les réservations.'], 409);
                }
                [$invoiceId, $error] = Bookings::createInvoice($org['id'], (int) $user['id'], $id);
                if ($error === null) {
                    Response::json(['success' => true, 'id' => $invoiceId]);
                }
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
