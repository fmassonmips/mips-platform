<?php
/**
 * RendezVous: e-mail reminders for tomorrow's appointments.
 * Run every hour from cron:  0 * * * *  php tools/rendezvous_reminders.php
 * Sends one reminder per appointment (booked, with an e-mail, starting within
 * 24 hours, booked more than 12 hours ahead). Safe to run twice in parallel.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$pdo = \App\Database::connection();
if ((int) $pdo->query("SELECT GET_LOCK('rendezvous_reminders', 0)")->fetchColumn() !== 1) {
    echo "Another run is in progress.\n";
    exit(0);
}
try {
    echo \App\RendezVous\Notifier::sendReminders() . " reminder(s) sent.\n";
} finally {
    $pdo->query("SELECT RELEASE_LOCK('rendezvous_reminders')");
}
