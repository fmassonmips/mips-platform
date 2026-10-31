<?php
/**
 * Calendar feed of one place, for Airbnb / Booking.com / Google Calendar:
 * /bookora/ical.php?u=<calendar token>. Nights taken only, no guest names.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$unit = \App\Bookora\Units::findByIcalToken(is_string($_GET['u'] ?? null) ? $_GET['u'] : '');
if ($unit === null || !\App\Suite\Modules::isEnabled((int) $unit['organization_id'], 'bookora')) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found.';
    exit;
}
header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: inline; filename="bookora-' . (int) $unit['id'] . '.ics"');
header('Cache-Control: private, max-age=300');
echo \App\Bookora\Ical::export($unit);
