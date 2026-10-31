<?php
/**
 * Turn a company's apps into paid subscriptions (MIPS staff), until online
 * billing exists. A subscribed app is fully usable again; a read-only one
 * (trial over) keeps all its data.
 *
 *   php tools/subscribe.php --org=<id> --app=<slug>|all          subscribe
 *   php tools/subscribe.php --org=<id> --app=<slug>|all --end    end the subscription: the app turns read-only
 *   php tools/subscribe.php --org=<id>                           show the company's apps
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

use App\Database;
use App\Suite\Catalog;

$opts  = getopt('', ['org:', 'app:', 'end']);
$orgId = (int) ($opts['org'] ?? 0);
$pdo   = Database::connection();
$name  = $pdo->prepare('SELECT name FROM organizations WHERE id = :o');
$name->execute([':o' => $orgId]);
$orgName = $name->fetchColumn();
if ($orgName === false) {
    fwrite(STDERR, "Usage: php tools/subscribe.php --org=<id> [--app=<slug>|all [--end]]\nUnknown company.\n");
    exit(1);
}

if (isset($opts['app'])) {
    $slugs = $opts['app'] === 'all' ? array_keys(Catalog::all()) : [(string) $opts['app']];
    foreach ($slugs as $slug) {
        if (Catalog::get($slug) === null) {
            fwrite(STDERR, "Unknown app: $slug\n");
            exit(1);
        }
        if (isset($opts['end'])) {
            // Back to "trial over": read-only, data kept.
            $pdo->prepare('UPDATE organization_modules SET status = \'trial\', trial_ends_at = LEAST(COALESCE(trial_ends_at, NOW()), NOW())
                           WHERE organization_id = :o AND module_slug = :s AND status = \'active\'')->execute([':o' => $orgId, ':s' => $slug]);
        } else {
            $pdo->prepare('INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at) VALUES (:o, :s, \'active\', NULL)
                           ON DUPLICATE KEY UPDATE status = \'active\', trial_ends_at = NULL')->execute([':o' => $orgId, ':s' => $slug]);
        }
    }
}

echo $orgName . " (#$orgId)\n";
$rows = $pdo->prepare('SELECT module_slug, status, trial_ends_at, trial_ends_at <= NOW() AS ended FROM organization_modules WHERE organization_id = :o ORDER BY module_slug');
$rows->execute([':o' => $orgId]);
foreach ($rows->fetchAll() as $r) {
    $state = match (true) {
        $r['status'] === 'active'   => 'subscribed',
        $r['status'] === 'disabled' => 'switched off',
        (int) $r['ended'] === 1 => 'read-only (trial ended ' . substr((string) $r['trial_ends_at'], 0, 10) . ')',
        default => 'trial until ' . substr((string) $r['trial_ends_at'], 0, 10),
    };
    printf("  %-12s %s\n", $r['module_slug'], $state);
}
