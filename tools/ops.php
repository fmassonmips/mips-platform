<?php
/**
 * Supervision, from the command line:
 *   php tools/ops.php record <job> <exit code>   (tools/cron.sh calls it after each job)
 *   php tools/ops.php status                     current problems; exits 1 if any
 *   php tools/ops.php watchdog                   e-mails ops.alert_email about them (cron, every 10 minutes)
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

use App\Ops\Alerts;
use App\Ops\Health;

$cmd = $argv[1] ?? '';
if ($cmd === 'record') {
    $job  = (string) ($argv[2] ?? '');
    $code = (string) ($argv[3] ?? '');
    if (!preg_match('/^[a-z0-9_]{1,40}$/', $job) || !preg_match('/^\d{1,3}$/', $code)) {
        fwrite(STDERR, "Usage: php tools/ops.php record <job> <exit code>\n");
        exit(2);
    }
    if (!isset(Health::JOBS[$job])) {
        fwrite(STDERR, "Unknown job '$job' (App\\Ops\\Health::JOBS): recorded, but nothing checks it.\n");
    }
    Health::record($job, (int) $code);
    exit(0);
}
if ($cmd === 'status') {
    $problems = Health::problems();
    echo $problems === [] ? "OK\n" : implode("\n", $problems) . "\n";
    exit($problems === [] ? 0 : 1);
}
if ($cmd === 'watchdog') {
    exit(Alerts::run());
}
fwrite(STDERR, "Usage: php tools/ops.php record <job> <code> | status | watchdog\n");
exit(2);
