<?php
/**
 * Scheduled job: email merchants the documents still missing on their
 * onboarding case. Respects kyc.reminder_every_days and kyc.max_reminders.
 *
 * Cron (daily, 8:00):   0 8 * * *  php /path/to/tools/kyc_reminders.php
 * Dry run:               php tools/kyc_reminders.php --dry-run
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require __DIR__ . '/../src/bootstrap.php';

$dry = in_array('--dry-run', $argv, true);
$kyc = new \App\Onboarding\Kyc();

foreach ($kyc->casesDueForReminder() as $caseId) {
    $case  = $kyc->getCase($caseId);
    $items = $kyc->outstanding($case);
    $to    = $kyc->contactEmail((int) $case['merchant_id']);
    if ($items === [] || $to === null) {
        echo "case $caseId ({$case['merchant_name']}): skipped (" . ($items === [] ? 'nothing outstanding' : 'no contact email') . ")\n";
        continue;
    }
    if ($dry) {
        echo "case $caseId ({$case['merchant_name']}): would email $to, " . count($items) . " item(s)\n";
        continue;
    }
    $r = $kyc->sendReminder($caseId, null);
    echo "case $caseId ({$case['merchant_name']}): " . ($r['delivered'] ? 'sent' : 'FAILED') . " to {$r['sent_to']}, " . count($r['items']) . " item(s)\n";
}
