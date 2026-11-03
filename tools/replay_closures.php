<?php
/**
 * After a database restore: put back the closures requested, cancelled and the
 * deletions done since the backup, from the journal kept outside the database
 * (config ops.closure_journal, App\Suite\ClosureJournal), then delete the companies
 * whose date has passed, without e-mailing their owners again.
 *
 *   php tools/replay_closures.php --dry-run   lists what would change
 *   php tools/replay_closures.php             applies it
 *
 * Run it as the web user right after tools/restore.sh … --replace (docs/incidents.md, fiche 15).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

$dry = in_array('--dry-run', $argv, true);
$lines = \App\Suite\ClosureJournal::replay($dry);
foreach ($lines as $l) {
    echo $l, "\n";
}
echo ($lines === [] ? 'Nothing to replay: the database already matches the closure journal.' : count($lines) . ' line(s)' . ($dry ? ' (dry run, nothing changed).' : '.')), "\n";
