<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Database;
use App\View;

class RenewalController
{
    private static function scope(): array
    {
        $a = $_SESSION['agent'] ?? [];
        return [
            'brokerage_id' => (int) ($a['brokerage_id'] ?? 0),
            'agent_id'     => (int) ($a['id'] ?? 0),
            'is_admin'     => ($a['role'] ?? '') === 'admin',
        ];
    }

    public static function index(): void
    {
        $db = Database::getInstance();
        $s  = self::scope();

        $statusFilter = $_GET['status'] ?? '';
        $params = [$s['brokerage_id']];
        $agentClause = '';
        if (!$s['is_admin']) {
            $agentClause = ' AND pol.agent_id = ?';
            $params[] = $s['agent_id'];
        }

        $statusClause = '';
        if ($statusFilter && in_array($statusFilter, ['pending', 'contacted', 'in_progress', 'paid', 'lapsed', 'cancelled'], true)) {
            $statusClause = ' AND r.status = ?';
            $params[] = $statusFilter;
        }

        $renewals = $db->fetchAll(
            "SELECT r.*,
                    pol.policy_number, pol.end_date, pol.premium_amount, pol.status AS policy_status,
                    c.first_name, c.last_name, c.email, c.phone_whatsapp,
                    i.name AS insurer_name,
                    pl.payment_url, pl.status AS link_status, pl.amount AS link_amount
             FROM renewals r
             JOIN policies pol ON pol.id = r.policy_id
             JOIN clients c    ON c.id  = pol.client_id
             JOIN insurers i   ON i.id  = pol.insurer_id
             LEFT JOIN payment_links pl ON pl.id = r.payment_link_id
             WHERE c.brokerage_id = ?
               {$agentClause}
               {$statusClause}
             ORDER BY pol.end_date ASC
             LIMIT 300",
            $params
        );

        $today = date('Y-m-d');
        View::render('renewals/index', compact('renewals', 'statusFilter', 'today'));
    }

    public static function send(int $id): void
    {
        Csrf::validate($_POST['csrf_token'] ?? '');
        $db = Database::getInstance();
        $s  = self::scope();

        // Ownership check
        $renewal = $db->fetchOne(
            'SELECT r.*, pol.policy_number, pol.end_date, pol.premium_amount,
                    c.first_name, c.last_name, c.email, c.phone_whatsapp, c.language_pref
             FROM renewals r
             JOIN policies pol ON pol.id = r.policy_id
             JOIN clients c    ON c.id   = pol.client_id
             WHERE r.id = ? AND c.brokerage_id = ?',
            [$id, $s['brokerage_id']]
        );

        if (!$renewal) {
            View::flash('error', 'Renewal not found.');
            header('Location: /renewals');
            exit;
        }

        try {
            $notifier = new \App\Services\NotificationService();
            $channel  = $_POST['channel'] ?? 'email';

            $notifier->send([
                'client_name'    => $renewal['first_name'] . ' ' . $renewal['last_name'],
                'client_email'   => $renewal['email'],
                'client_phone'   => $renewal['phone_whatsapp'],
                'language'       => $renewal['language_pref'] ?? 'en',
                'template_slug'  => 'renewal_reminder',
                'channel'        => $channel,
                'variables'      => [
                    'policy_number' => $renewal['policy_number'],
                    'end_date'      => $renewal['end_date'],
                    'premium'       => number_format((float) $renewal['premium_amount'], 2),
                    'payment_url'   => $renewal['payment_url'] ?? '',
                ],
            ]);

            $db->execute(
                "UPDATE renewals SET status = 'contacted', updated_at = NOW() WHERE id = ?",
                [$id]
            );

            View::flash('success', 'Renewal reminder sent to ' . $renewal['first_name'] . ' ' . $renewal['last_name'] . '.');
        } catch (\Throwable $e) {
            error_log('[RenewalController] ' . $e->getMessage());
            View::flash('error', 'Could not send notification. Check notification service configuration.');
        }

        header('Location: /renewals');
        exit;
    }
}
