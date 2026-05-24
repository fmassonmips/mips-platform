<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Database;
use App\View;

class PaymentController
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

        $where  = 'p.brokerage_id = ?';
        $params = [$s['brokerage_id']];

        if (!$s['is_admin']) {
            $where .= ' AND pol.agent_id = ?';
            $params[] = $s['agent_id'];
        }

        $statusFilter = $_GET['status'] ?? '';
        if ($statusFilter && in_array($statusFilter, ['pending', 'paid', 'expired', 'cancelled'], true)) {
            $where .= ' AND pl.status = ?';
            $params[] = $statusFilter;
        }

        $payments = $db->fetchAll(
            "SELECT pl.*, pol.policy_number, pol.premium_amount,
                    c.first_name, c.last_name, c.email, c.phone_whatsapp,
                    i.name AS insurer_name
             FROM payment_links pl
             JOIN policies pol ON pol.id = pl.policy_id
             JOIN brokerages p  ON p.id  = pol.brokerage_id
             JOIN clients c     ON c.id  = pol.client_id
             JOIN insurers i    ON i.id  = pol.insurer_id
             WHERE {$where}
             ORDER BY pl.created_at DESC
             LIMIT 200",
            $params
        );

        View::render('payments/index', compact('payments', 'statusFilter'));
    }

    public static function generate(): void
    {
        Csrf::validate($_POST['csrf_token'] ?? '');
        $db = Database::getInstance();
        $s  = self::scope();

        $policyId = (int) ($_POST['policy_id'] ?? 0);
        $amount   = (float) str_replace(',', '', $_POST['amount'] ?? '0');

        if ($policyId === 0 || $amount <= 0) {
            View::flash('error', 'Invalid policy or amount.');
            header('Location: /payments');
            exit;
        }

        // Ownership check — policy must belong to this brokerage
        $policy = $db->fetchOne(
            'SELECT pol.*, c.first_name, c.last_name, c.email
             FROM policies pol
             JOIN clients c ON c.id = pol.client_id
             WHERE pol.id = ? AND c.brokerage_id = ?',
            [$policyId, $s['brokerage_id']]
        );

        if (!$policy) {
            View::flash('error', 'Policy not found.');
            header('Location: /payments');
            exit;
        }

        // Generate the payment link
        try {
            $mips     = new \App\Services\MipsService($s['brokerage_id']);
            $ref      = 'PAY-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -6));
            $linkData = $mips->createPaymentLink([
                'amount'      => $amount,
                'reference'   => $ref,
                'description' => 'Premium — ' . ($policy['policy_number'] ?: 'Policy #' . $policyId),
                'email'       => $policy['email'],
            ]);

            $db->execute(
                "INSERT INTO payment_links
                    (policy_id, reference, payment_url, amount, status, expires_at)
                 VALUES (?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 30 DAY))",
                [$policyId, $ref, $linkData['payment_url'] ?? '', $amount]
            );

            View::flash('success', 'Payment link generated: ' . ($linkData['payment_url'] ?? ''));
        } catch (\Throwable $e) {
            error_log('[PaymentController] ' . $e->getMessage());
            View::flash('error', 'Could not generate payment link. Check MIPS configuration.');
        }

        header('Location: /policies/' . $policyId);
        exit;
    }
}
