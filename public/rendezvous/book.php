<?php
/**
 * Public booking page: /rendezvous/book.php?o=<booking link token>
 * No login. Language = the company's document language.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\RendezVous\Booking;
use App\RendezVous\Services;
use App\RendezVous\Settings;
use App\RendezVous\Staff;
use App\RendezVous\Text;

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
$open     = $settings['booking_enabled'] && \App\Suite\Modules::isEnabled($orgId, 'rendezvous');
$services = $open ? Services::all($orgId, true) : [];
$staff    = $open ? Staff::all($orgId, true) : [];
$today    = Booking::now()->format('Y-m-d');
$maxDate  = Booking::now()->modify('+' . $settings['max_days_ahead'] . ' days')->format('Y-m-d');
$csrf     = \App\Csrf::token();
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/rendezvous/book.view.php';
