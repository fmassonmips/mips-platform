<?php
/**
 * Renewal automation cron — run daily at 08:00 MUT via cPanel cron.
 *
 * cPanel command:
 *   /usr/local/bin/php /home/USERNAME/public_html/cron/renewal.php >> /home/USERNAME/logs/renewal.log 2>&1
 */
declare(strict_types=1);

define('ROOT_PATH', dirname(__DIR__));

require ROOT_PATH . '/src/bootstrap.php';

$db   = App\Database::getInstance();
$log  = static function (string $msg): void {
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
};

$today   = date('Y-m-d');
$stats   = ['checked' => 0, 'links_created' => 0, 'notified' => 0, 'errors' => 0];

$log('Renewal cron started.');

// Fetch active policies expiring within 45 days that have pending renewals
$policies = $db->fetchAll(
    "SELECT pol.id AS policy_id, pol.policy_number, pol.end_date, pol.premium_amount,
            pol.brokerage_id, pol.agent_id,
            c.first_name, c.last_name, c.email, c.phone_whatsapp, c.language_pref,
            r.id AS renewal_id, r.status AS renewal_status,
            r.trigger_date_j45, r.trigger_date_j30, r.trigger_date_j15,
            r.payment_link_id
     FROM policies pol
     JOIN clients c    ON c.id = pol.client_id
     JOIN renewals r   ON r.policy_id = pol.id
     WHERE pol.status = 'active'
       AND pol.end_date BETWEEN ? AND DATE_ADD(?, INTERVAL 45 DAY)
       AND r.status NOT IN ('paid', 'cancelled')
       AND r.renewal_year = YEAR(pol.end_date)",
    [$today, $today]
);

$log('Found ' . count($policies) . ' active policies with pending renewals.');

foreach ($policies as $p) {
    $stats['checked']++;
    $renewalId = (int) $p['renewal_id'];
    $policyId  = (int) $p['policy_id'];

    // Determine which trigger milestone applies today
    $milestone = null;
    if ($p['trigger_date_j45'] === $today) $milestone = 'j45';
    if ($p['trigger_date_j30'] === $today) $milestone = 'j30';
    if ($p['trigger_date_j15'] === $today) $milestone = 'j15';

    // Ensure a payment link exists for J-30 and closer
    $needsLink = in_array($milestone, ['j30', 'j15'], true) && !$p['payment_link_id'];
    if ($needsLink) {
        try {
            $mips   = new App\Services\MipsService((int) $p['brokerage_id']);
            $ref    = 'REN-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -6));
            $result = $mips->createPaymentLink([
                'amount'      => (float) $p['premium_amount'],
                'reference'   => $ref,
                'description' => 'Renewal — ' . ($p['policy_number'] ?: 'Policy #' . $policyId),
                'email'       => $p['email'],
            ]);

            $db->execute(
                "INSERT INTO payment_links
                    (policy_id, reference, payment_url, amount, status, expires_at)
                 VALUES (?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 30 DAY))",
                [$policyId, $ref, $result['payment_url'] ?? '', (float) $p['premium_amount']]
            );
            $linkId = (int) $db->lastInsertId();

            $db->execute(
                "UPDATE renewals SET payment_link_id = ?, updated_at = NOW() WHERE id = ?",
                [$linkId, $renewalId]
            );
            $p['payment_link_id'] = $linkId;
            $stats['links_created']++;
            $log("Created payment link {$ref} for policy #{$policyId}");
        } catch (\Throwable $e) {
            $stats['errors']++;
            $log("ERROR creating payment link for policy #{$policyId}: " . $e->getMessage());
        }
    }

    // Send notification if at a milestone
    if ($milestone) {
        try {
            $notifier = new App\Services\NotificationService();
            $slugMap  = ['j45' => 'renewal_j45', 'j30' => 'renewal_j30', 'j15' => 'renewal_j15'];

            // Fetch payment URL if we have one
            $payUrl = '';
            if ($p['payment_link_id']) {
                $lnk    = $db->fetchOne('SELECT payment_url FROM payment_links WHERE id = ?', [(int) $p['payment_link_id']]);
                $payUrl = $lnk['payment_url'] ?? '';
            }

            $notifier->send([
                'client_name'   => $p['first_name'] . ' ' . $p['last_name'],
                'client_email'  => $p['email'],
                'client_phone'  => $p['phone_whatsapp'],
                'language'      => $p['language_pref'] ?? 'en',
                'template_slug' => $slugMap[$milestone],
                'channel'       => 'email',
                'variables'     => [
                    'policy_number' => $p['policy_number'],
                    'end_date'      => $p['end_date'],
                    'premium'       => number_format((float) $p['premium_amount'], 2),
                    'payment_url'   => $payUrl,
                ],
            ]);

            $db->execute(
                "UPDATE renewals SET status = 'contacted', updated_at = NOW() WHERE id = ? AND status = 'pending'",
                [$renewalId]
            );
            $stats['notified']++;
            $log("Sent {$milestone} reminder to {$p['email']} (policy #{$policyId})");
        } catch (\Throwable $e) {
            $stats['errors']++;
            $log("ERROR sending {$milestone} notification for policy #{$policyId}: " . $e->getMessage());
        }
    }

    // Mark lapsed if policy has expired
    if ($p['end_date'] < $today) {
        $db->execute(
            "UPDATE renewals SET status = 'lapsed', updated_at = NOW() WHERE id = ? AND status NOT IN ('paid','cancelled','lapsed')",
            [$renewalId]
        );
        $db->execute(
            "UPDATE policies SET status = 'lapsed', updated_at = NOW() WHERE id = ? AND status = 'active'",
            [$policyId]
        );
    }
}

$log(sprintf(
    'Done. Checked: %d | Links created: %d | Notifications: %d | Errors: %d',
    $stats['checked'], $stats['links_created'], $stats['notified'], $stats['errors']
));
