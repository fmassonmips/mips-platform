<?php
/**
 * For an external uptime monitor: 200 "ok" when the database answers, every
 * scheduled job ran recently and succeeded and the disk is not full; 503
 * "degraded" otherwise. Says nothing more: the details are e-mailed by
 * tools/ops.php watchdog and shown by `php tools/ops.php status`.
 */
declare(strict_types=1);

define('MIPS_NO_SESSION', true);
require __DIR__ . '/../src/bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
$ok = \App\Ops\Health::problems() === [];
http_response_code($ok ? 200 : 503);
echo $ok ? "ok\n" : "degraded\n";
