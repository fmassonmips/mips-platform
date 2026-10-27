<?php
/**
 * Customer's appointment page: /rendezvous/manage.php?t=<appointment token>
 * Reached after booking and from the e-mails; view or cancel. No login.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\RendezVous\Booking;
use App\RendezVous\Text;

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$token = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';
$found = Booking::findByToken($token);
if ($found === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Rendez-vous introuvable.\nAppointment not found.";
    exit;
}
[$orgId, $appt] = $found;

$profile     = \App\Suite\Tenant::profile($orgId);
$lang        = $profile['document_language'];
$t           = Text::for($lang);
$isPast      = (string) $appt['starts_at'] < Booking::now()->format('Y-m-d H:i:s');
$cancellable = !$isPast && Booking::cancellableOnline($orgId, $appt);
$justBooked  = ($_GET['new'] ?? '') === '1';
$csrf        = \App\Csrf::token();
$e           = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/rendezvous/manage.view.php';
