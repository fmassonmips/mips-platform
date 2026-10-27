<?php
/**
 * POST /api/flowdesk/public — customers, no login (CSRF token of the page).
 *
 * Input (JSON body):
 *   { "action": "create", "o": <support form token>, "name", "email", "phone", "subject", "message", "website": "" }
 *   { "action": "reply",  "t": <ticket token>, "body" }
 *
 * Responses: 200 { "success": true, "ticket_url"? } · 404 / 409 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\FlowDesk;

use App\Csrf;
use App\FlowDesk\Settings;
use App\FlowDesk\Text;
use App\FlowDesk\Tickets;
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
        $ip   = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

        if (Request::str($data, 'action', 10) === 'reply') {
            $found = Tickets::findByToken(Request::str($data, 't', 60));
            $t     = Text::for($found !== null ? Tenant::profile($found[0])['document_language'] : 'fr');
            $this->csrf($t);
            $error = Tickets::customerReply(Request::str($data, 't', 60), Request::str($data, 'body', 12000), $ip, $t);
            if ($error !== null) {
                Response::json(['error' => $error], 409);
            }
            Response::json(['success' => true]);
        }

        $orgId = Settings::orgByToken(Request::str($data, 'o', 40));
        $t     = Text::for($orgId !== null ? Tenant::profile($orgId)['document_language'] : 'fr');
        $this->csrf($t);
        if ($orgId === null) {
            Response::json(['error' => $t['not_found']], 404);
        }
        if (!Modules::isEnabled($orgId, 'flowdesk') || !Settings::get($orgId)['form_enabled']) {
            Response::json(['error' => $t['closed_form']], 409);
        }
        // Bots fill every field; people never see this one.
        if (Request::str($data, 'website', 200) !== '') {
            Response::json(['success' => true, 'ticket_url' => null]);
        }
        $in = [];
        foreach (['name' => 200, 'email' => 300, 'phone' => 40, 'subject' => 300, 'message' => 12000] as $f => $max) {
            $in[$f] = Request::str($data, $f, $max);
        }
        [$ticket, $error] = Tickets::create($orgId, $in, 'web', null, $ip, $t);
        if ($error !== null) {
            Response::json(['error' => $error], $error === $t['err_limit'] ? 409 : 422);
        }
        Response::json(['success' => true, 'ticket_url' => '/flowdesk/t.php?t=' . $ticket['token'] . '&new=1']);
    }

    /**
     * @param array<string,string> $t
     */
    private function csrf(array $t): void
    {
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => $t['err_session']], 419);
        }
    }
}
