<?php
/**
 * Daily automatic e-mails: end-of-trial reminders (owner/admins) and reminders
 * of overdue Facturo invoices (to clients, companies that switched them on).
 * Each e-mail is sent once; one that fails is tried again on the next run.
 * Run once a day, in the morning (Mauritius time) from cron:
 *   5 5 * * *  php tools/reminders.php        (05:05 UTC = 09:05 in Mauritius)
 * Exits 1 when an e-mail could not be sent, so cron alerts.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$pdo = \App\Database::connection();
if ((int) $pdo->query("SELECT GET_LOCK('reminders', 0)")->fetchColumn() !== 1) {
    echo "Another run is in progress.\n";
    exit(0);
}
$status = 0;
try {
    if (!\App\Mail\SmtpMailer::isConfigured()) {
        echo "E-mail not configured: nothing sent.\n";
    }
    try {
        echo \App\Suite\Notifications::trialReminders() . " end-of-trial reminder(s) sent.\n";
    } catch (\Throwable $e) {
        error_log('[reminders] trials: ' . $e->getMessage());
        echo "End-of-trial reminders failed: see the PHP log.\n";
        $status = 1;
    }
    try {
        [$sent, $failed] = \App\Facturo\Reminders::run();
        echo $sent . ' invoice reminder(s) sent' . ($failed > 0 ? ", $failed failed (retried tomorrow)" : '') . ".\n";
        if ($failed > 0) {
            $status = 1;
        }
    } catch (\Throwable $e) {
        error_log('[reminders] invoices: ' . $e->getMessage());
        echo "Invoice reminders failed: see the PHP log.\n";
        $status = 1;
    }
} finally {
    $pdo->query("SELECT RELEASE_LOCK('reminders')");
}
exit($status);
