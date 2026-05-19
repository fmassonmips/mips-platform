<?php
/**
 * Renewal Trigger Engine — runs daily at 08:00 (Africa/Mauritius)
 *
 * Cron entry:
 *   0 8 * * * /usr/bin/php /path/to/mips-platform/tools/renewal_cron.php >> /var/log/mips_renewal.log 2>&1
 *
 * Triggers personalised email + WhatsApp renewal messages at:
 *   J-45, J-30, J-15 → renewal reminders with MIPS payment link
 *   J-0  → lapse notification to client + broker escalation
 */
declare(strict_types=1);

date_default_timezone_set('Indian/Mauritius');

require_once __DIR__ . '/../src/bootstrap.php';

use App\Database;
use App\Services\MipsService;
use App\Services\NotificationService;
use App\Services\RenewalService;

$db   = Database::getInstance();
$mips = new MipsService($db);
$notif = new NotificationService($db);
$svc  = new RenewalService($db, $mips, $notif);

$today = new DateTimeImmutable('today');

log_line('=== Renewal cron started: ' . $today->format('Y-m-d H:i:s') . ' ===');

// Collect all active policies with renewals due in the next 45 days
// whose trigger has not yet fired for the relevant milestone.
$rows = $db->fetchAll(
    "SELECT
        p.id            AS policy_id,
        p.client_id,
        p.agent_id,
        p.insurer_id,
        p.policy_number,
        p.premium_amount,
        p.end_date,
        p.status        AS policy_status,
        r.id            AS renewal_id,
        r.renewal_year,
        r.status        AS renewal_status,
        r.trigger_date_j45,
        r.trigger_date_j30,
        r.trigger_date_j15,
        r.j45_sent_at,
        r.j30_sent_at,
        r.j15_sent_at,
        r.j0_sent_at,
        r.renewal_premium,
        r.payment_link_id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone_whatsapp,
        c.language_pref,
        i.name          AS insurer_name,
        ip.product_name AS product_name,
        a.id            AS agent_db_id,
        u.name          AS agent_name,
        u.email         AS agent_email,
        b.name          AS brokerage_name,
        b.whatsapp_number AS brokerage_wa
     FROM policies p
     JOIN renewals   r ON r.policy_id = p.id
                      AND r.renewal_year = YEAR(p.end_date)
     JOIN clients    c ON c.id = p.client_id
     JOIN insurers   i ON i.id = p.insurer_id
     LEFT JOIN insurer_products ip ON ip.id = p.insurer_product_id
     JOIN agents     a ON a.id = p.agent_id
     JOIN users      u ON u.id = a.user_id
     JOIN brokerages b ON b.id = a.brokerage_id
     WHERE p.status IN ('active', 'lapsed')
       AND r.status NOT IN ('paid', 'cancelled')
       AND p.end_date >= CURDATE()
       AND p.end_date <= DATE_ADD(CURDATE(), INTERVAL 45 DAY)"
);

log_line('Policies to evaluate: ' . count($rows));

$stats = ['j45' => 0, 'j30' => 0, 'j15' => 0, 'j0' => 0, 'errors' => 0];

foreach ($rows as $row) {
    try {
        $expiry  = new DateTimeImmutable($row['end_date']);
        $daysLeft = (int) $today->diff($expiry)->days;
        // diff is unsigned; if expiry is in the past, flag as 0
        if ($expiry < $today) {
            $daysLeft = 0;
        }

        $context = build_context($row);
        $fired   = false;

        if ($daysLeft === 0 && $row['j0_sent_at'] === null) {
            $svc->triggerJ0($row['renewal_id'], $row['policy_id'], $context);
            $stats['j0']++;
            $fired = true;
        } elseif ($daysLeft <= 15 && $row['j15_sent_at'] === null) {
            ensure_payment_link($mips, $db, $row, $context);
            $svc->triggerJ15($row['renewal_id'], $context);
            $stats['j15']++;
            $fired = true;
        } elseif ($daysLeft <= 30 && $row['j30_sent_at'] === null) {
            ensure_payment_link($mips, $db, $row, $context);
            $svc->triggerJ30($row['renewal_id'], $context);
            $stats['j30']++;
            $fired = true;
        } elseif ($daysLeft <= 45 && $row['j45_sent_at'] === null) {
            ensure_payment_link($mips, $db, $row, $context);
            $svc->triggerJ45($row['renewal_id'], $context);
            $stats['j45']++;
            $fired = true;
        }

        if ($fired) {
            log_line(sprintf(
                'Policy %s (client: %s %s) — trigger fired, %d days left',
                $row['policy_number'] ?? $row['policy_id'],
                $row['first_name'],
                $row['last_name'],
                $daysLeft
            ));
        }
    } catch (Throwable $e) {
        $stats['errors']++;
        log_line('ERROR policy_id=' . $row['policy_id'] . ': ' . $e->getMessage());
    }
}

log_line(sprintf(
    'Done — J45:%d J30:%d J15:%d J0:%d errors:%d',
    $stats['j45'], $stats['j30'], $stats['j15'], $stats['j0'], $stats['errors']
));

// ---------------------------------------------------------------------------

function build_context(array $row): array
{
    return [
        'client_name'     => trim($row['first_name'] . ' ' . $row['last_name']),
        'policy_type'     => $row['product_name'] ?? 'Insurance',
        'policy_number'   => $row['policy_number'] ?? '',
        'insurer_name'    => $row['insurer_name'],
        'expiry_date'     => (new DateTimeImmutable($row['end_date']))->format('d M Y'),
        'premium_amount'  => number_format((float) ($row['renewal_premium'] ?? $row['premium_amount']), 2),
        'payment_link'    => '',   // populated after ensure_payment_link()
        'agent_name'      => $row['agent_name'],
        'agent_phone'     => '',   // populated from agents.working_hours_json or separate field
        'agent_email'     => $row['agent_email'],
        'brokerage_name'  => $row['brokerage_name'],
        'language'        => $row['language_pref'] ?? 'en',
        'client_email'    => $row['email'],
        'client_wa'       => $row['phone_whatsapp'],
    ];
}

function ensure_payment_link(MipsService $mips, $db, array $row, array &$context): void
{
    if (!empty($row['payment_link_id'])) {
        // Reuse existing link if still pending
        $link = $db->fetchOne(
            'SELECT payment_url, status FROM payment_links WHERE id = ?',
            [$row['payment_link_id']]
        );
        if ($link && $link['status'] === 'pending') {
            $context['payment_link'] = $link['payment_url'];
            return;
        }
    }

    $premium = (float) ($row['renewal_premium'] ?? $row['premium_amount']);
    $linkData = $mips->createPaymentLink([
        'amount'      => $premium,
        'description' => sprintf(
            'Renewal — Policy %s (%s)',
            $row['policy_number'] ?? $row['policy_id'],
            $row['insurer_name']
        ),
        'reference'   => $row['policy_number'] ?? 'POL-' . $row['policy_id'],
    ]);

    // Persist the new payment link
    $db->execute(
        "INSERT INTO payment_links
            (policy_id, renewal_id, generated_by_agent_id, mips_transaction_ref,
             amount, description, payment_url, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 30 DAY))",
        [
            $row['policy_id'],
            $row['renewal_id'],
            $row['agent_db_id'],
            $linkData['transaction_ref'] ?? null,
            $premium,
            sprintf('Renewal policy %s', $row['policy_number'] ?? $row['policy_id']),
            $linkData['payment_url'],
        ]
    );

    $newLinkId = $db->lastInsertId();

    // Attach to renewal record
    $db->execute(
        'UPDATE renewals SET payment_link_id = ? WHERE id = ?',
        [$newLinkId, $row['renewal_id']]
    );

    $context['payment_link'] = $linkData['payment_url'];
}

function log_line(string $msg): void
{
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}
