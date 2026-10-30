<?php
/**
 * Public booking page: /bookora/s.php?o=<link token>
 * Dates and guests → places free with their price → booking request. No login.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\Bookora\Settings;
use App\Bookora\Text;
use App\Bookora\Units;

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: private, no-store');

$token = is_string($_GET['o'] ?? null) ? $_GET['o'] : '';
$orgId = Settings::orgByToken($token);
if ($orgId === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Page introuvable.\nPage not found.";
    exit;
}
$profile  = \App\Suite\Tenant::profile($orgId);
$lang     = $profile['document_language'];
$t        = Text::for($lang);
$settings = Settings::get($orgId);
$open     = $settings['booking_open'] && \App\Suite\Modules::isEnabled($orgId, 'bookora');
$units    = $open ? Units::all($orgId, true) : [];
$today    = \App\RendezVous\Booking::now();
$csrf     = \App\Csrf::token();
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/bookora/book-public.view.php';
