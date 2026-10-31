<?php
/**
 * Public form page: /formelio/f.php?t=<form token>[&r=<RendezVous appointment token>]
 * No login. Members of the organization see a closed or draft form as a preview.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\Formelio\Forms;
use App\Formelio\Responses;
use App\Formelio\Text;

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$form = Forms::findByToken(is_string($_GET['t'] ?? null) ? $_GET['t'] : '');
if ($form === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Formulaire introuvable.\nForm not found.";
    exit;
}
$orgId   = (int) $form['organization_id'];
$profile = \App\Suite\Tenant::profile($orgId);
$lang    = $profile['document_language'];
$t       = Text::for($lang);
$open    = $form['status'] === 'open' && \App\Suite\Modules::isEnabled($orgId, 'formelio');

$user    = \App\Auth::current_user();
$preview = !$open && $user !== null && \App\Suite\Tenant::forUser($user)['id'] === $orgId;

// Survey sent after a RendezVous appointment: one answer per appointment.
$r       = is_string($_GET['r'] ?? null) && preg_match('/^[0-9a-f]{48}$/', $_GET['r']) ? $_GET['r'] : '';
$already = false;
if ($r !== '') {
    $found   = \App\RendezVous\Booking::findByToken($r);
    $already = $found !== null && $found[0] === $orgId && Responses::hasSource((int) $form['id'], 'rendezvous:' . (int) $found[1]['id']);
}

$csrf = \App\Csrf::token();
$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
require TEMPLATES_PATH . '/modules/formelio/form.view.php';
