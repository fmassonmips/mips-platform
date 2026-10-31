<?php
/**
 * POST /api/formelio/public — submit a response, no login (CSRF token of the form page).
 *
 * Input (JSON body):
 *   { "t": <form token>, "r": <RendezVous appointment token, optional>,
 *     "answers": { "f1": "…", "f2": ["…"] }, "website": "" (honeypot, must stay empty) }
 *
 * Responses: 200 { "success": true } · 404 / 409 / 419 / 422 { "error": "..." } (form's language)
 */
declare(strict_types=1);

namespace App\Controllers\Formelio;

use App\Csrf;
use App\Formelio\Forms;
use App\Formelio\Responses;
use App\Formelio\Text;
use App\RendezVous\Booking;
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
        $data = Request::json();
        $form = Forms::findByToken(Request::str($data, 't', 40));
        $t    = Text::for($form !== null ? Tenant::profile((int) $form['organization_id'])['document_language'] : 'fr');
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => $t['err_session']], 419);
        }
        if ($form === null) {
            Response::json(['error' => $t['not_found']], 404);
        }
        $orgId = (int) $form['organization_id'];
        if ($form['status'] !== 'open' || !Modules::isEnabled($orgId, 'formelio')) {
            Response::json(['error' => $t['closed']], 409);
        }
        // Bots fill every field; people never see this one.
        if (Request::str($data, 'website', 200) !== '') {
            Response::json(['success' => true]);
        }

        $source = null;
        $r      = Request::str($data, 'r', 60);
        if ($r !== '') {
            $found = Booking::findByToken($r);
            if ($found !== null && $found[0] === $orgId) {
                $source = 'rendezvous:' . (int) $found[1]['id'];
            }
        }

        [$id, $error] = Responses::submit($form, is_array($data['answers'] ?? null) ? $data['answers'] : [],
            Request::clientIp(), $source, $t);
        if ($error !== null) {
            Response::json(['error' => $error], $error === $t['already'] || $error === $t['err_limit'] ? 409 : 422);
        }
        Responses::notify($form, $id);
        if ((int) $form['flowdesk_ticket'] === 1 && Modules::isEnabled($orgId, 'flowdesk')) {
            try {
                $error = \App\FlowDesk\Tickets::fromFormResponse($orgId, $form, Responses::answers($id));
                if ($error !== null) {
                    error_log('[Formelio→FlowDesk] form ' . (int) $form['id'] . ': ' . $error);
                }
            } catch (\Throwable $e) {
                error_log('[Formelio→FlowDesk] ' . $e->getMessage());
            }
        }
        Response::json(['success' => true]);
    }
}
