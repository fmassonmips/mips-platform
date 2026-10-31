<?php
/**
 * Guest's booking page: /bookora/b.php?t=<booking token>
 * Stay, status, how to pay the deposit, cancel while unconfirmed. No login.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$found = \App\Bookora\Bookings::findByToken(is_string($_GET['t'] ?? null) ? $_GET['t'] : '');
if ($found === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Réservation introuvable.\nBooking not found.";
    exit;
}
[$orgId, $booking] = $found;
$profile  = \App\Suite\Tenant::profile($orgId);
$lang     = $profile['document_language'];
$t        = \App\Bookora\Text::for($lang);
$settings = \App\Bookora\Settings::get($orgId);
$isNew    = ($_GET['new'] ?? '') === '1';
$csrf     = \App\Csrf::token();
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/bookora/booking-public.view.php';
