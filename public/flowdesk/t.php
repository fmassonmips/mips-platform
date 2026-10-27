<?php
/**
 * Customer's ticket page: /flowdesk/t.php?t=<ticket token>
 * Thread (without internal notes) and reply box. No login.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\FlowDesk\Text;
use App\FlowDesk\Tickets;

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$found = Tickets::findByToken(is_string($_GET['t'] ?? null) ? $_GET['t'] : '');
if ($found === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Demande introuvable.\nRequest not found.";
    exit;
}
[$orgId, $ticket] = $found;
$profile  = \App\Suite\Tenant::profile($orgId);
$lang     = $profile['document_language'];
$t        = Text::for($lang);
$messages = Tickets::messages((int) $ticket['id'], false);
$isNew    = ($_GET['new'] ?? '') === '1';
$csrf     = \App\Csrf::token();
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/flowdesk/ticket-public.view.php';
