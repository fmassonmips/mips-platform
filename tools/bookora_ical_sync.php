<?php
/**
 * Bookora: re-read the calendars imported from Airbnb, Booking.com…
 * Run every hour from cron:  20 * * * *  php tools/bookora_ical_sync.php
 * One place at a time; a calendar that cannot be read keeps its previous
 * blocks and shows the error on the place. Safe to run twice in parallel.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$pdo = \App\Database::connection();
if ((int) $pdo->query("SELECT GET_LOCK('bookora_ical_sync', 0)")->fetchColumn() !== 1) {
    echo "Another run is in progress.\n";
    exit(0);
}
try {
    $units = $pdo->query(
        "SELECT u.* FROM bookora_units u JOIN organization_modules m ON m.organization_id = u.organization_id AND m.module_slug = 'bookora'
         WHERE u.active = 1 AND u.ical_import_url IS NOT NULL AND m.status <> 'disabled'
           AND (m.status = 'active' OR m.trial_ends_at IS NULL OR m.trial_ends_at > NOW())"
    )->fetchAll();
    $ok = $failed = 0;
    foreach ($units as $unit) {
        [, $error] = \App\Bookora\Ical::sync($unit);
        $error === null ? $ok++ : $failed++;
    }
    echo $ok . ' calendar(s) synced, ' . $failed . " with an error or a double booking.\n";
} finally {
    $pdo->query("SELECT RELEASE_LOCK('bookora_ical_sync')");
}
