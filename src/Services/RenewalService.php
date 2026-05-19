<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Orchestrates the renewal pipeline state machine.
 *
 * State transitions:
 *   pending → contacted (J-45/30/15 message sent)
 *   contacted → paid    (payment webhook received)
 *   contacted → lapsed  (J-0 fired, no payment)
 *   paid → (new policy period created by WebhookController)
 */
class RenewalService
{
    public function __construct(
        private readonly Database            $db,
        private readonly MipsService         $mips,
        private readonly NotificationService $notif
    ) {}

    public function triggerJ45(int $renewalId, array $context): void
    {
        $this->sendRenewalMessage('renewal_j45', $renewalId, $context);
        $this->db->execute(
            'UPDATE renewals SET j45_sent_at = NOW(), status = "contacted" WHERE id = ?',
            [$renewalId]
        );
        $this->audit($renewalId, 'j45_triggered', $context);
    }

    public function triggerJ30(int $renewalId, array $context): void
    {
        $this->sendRenewalMessage('renewal_j30', $renewalId, $context);
        $this->db->execute(
            'UPDATE renewals SET j30_sent_at = NOW(), status = "contacted" WHERE id = ?',
            [$renewalId]
        );
        $this->audit($renewalId, 'j30_triggered', $context);
    }

    public function triggerJ15(int $renewalId, array $context): void
    {
        $this->sendRenewalMessage('renewal_j15', $renewalId, $context);
        $this->db->execute(
            'UPDATE renewals SET j15_sent_at = NOW(), status = "contacted" WHERE id = ?',
            [$renewalId]
        );
        $this->notifyAgentEscalation($renewalId, $context, 'J-15 escalation');
        $this->audit($renewalId, 'j15_triggered', $context);
    }

    /**
     * J-0: policy has expired without payment.
     * Marks policy as lapsed, sends lapse notices to client and broker.
     */
    public function triggerJ0(int $renewalId, int $policyId, array $context): void
    {
        // Lapse the policy
        $this->db->execute(
            'UPDATE policies SET status = "lapsed" WHERE id = ?',
            [$policyId]
        );

        // Send lapse message to client
        $this->sendRenewalMessage('renewal_j0', $renewalId, $context);

        $this->db->execute(
            'UPDATE renewals SET j0_sent_at = NOW(), status = "lapsed" WHERE id = ?',
            [$renewalId]
        );

        // Escalate to agent and admin
        $this->notifyAgentEscalation($renewalId, $context, 'POLICY LAPSED');
        $this->audit($renewalId, 'j0_lapsed', $context);
    }

    /**
     * Called by WebhookController when MIPS confirms payment.
     * Creates the next policy period and closes the renewal.
     */
    public function markPaid(int $renewalId, int $policyId, float $amountReceived): void
    {
        $this->db->execute(
            'UPDATE renewals SET status = "paid", completed_at = NOW() WHERE id = ?',
            [$renewalId]
        );

        // Reactivate policy if it had lapsed
        $policy = $this->db->fetchOne(
            'SELECT end_date, insurer_id, insurer_product_id, client_id, agent_id,
                    premium_amount, cover_type, payment_frequency, asset_description,
                    asset_metadata_json, broker_commission_pct, policy_number
             FROM policies WHERE id = ?',
            [$policyId]
        );

        if (!$policy) {
            return;
        }

        $this->db->execute(
            'UPDATE policies SET status = "renewed" WHERE id = ?',
            [$policyId]
        );

        // Create new policy period (start = old end + 1 day)
        $newStart  = (new \DateTimeImmutable($policy['end_date']))->modify('+1 day');
        $newEnd    = $newStart->modify('+1 year')->modify('-1 day');
        $newRef    = 'INS-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));
        $commAmt   = $policy['broker_commission_pct']
                        ? round($amountReceived * (float) $policy['broker_commission_pct'] / 100, 2)
                        : null;

        $this->db->execute(
            "INSERT INTO policies
                (client_id, agent_id, insurer_id, insurer_product_id, policy_number,
                 internal_ref, status, premium_amount, start_date, end_date,
                 cover_type, payment_frequency, asset_description, asset_metadata_json,
                 broker_commission_pct, broker_commission_amt)
             VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $policy['client_id'],
                $policy['agent_id'],
                $policy['insurer_id'],
                $policy['insurer_product_id'],
                $policy['policy_number'],
                $newRef,
                $amountReceived,
                $newStart->format('Y-m-d'),
                $newEnd->format('Y-m-d'),
                $policy['cover_type'],
                $policy['payment_frequency'],
                $policy['asset_description'],
                $policy['asset_metadata_json'],
                $policy['broker_commission_pct'],
                $commAmt,
            ]
        );

        $newPolicyId = (int) $this->db->lastInsertId();

        // Pre-create renewal record for the new period
        $this->createRenewalRecord($newPolicyId, $newEnd->format('Y-m-d'));

        $this->audit($renewalId, 'renewal_paid', ['new_policy_id' => $newPolicyId]);
    }

    public function createRenewalRecord(int $policyId, string $endDate): int
    {
        $expiry = new \DateTimeImmutable($endDate);

        $this->db->execute(
            "INSERT INTO renewals
                (policy_id, renewal_year, status, trigger_date_j45, trigger_date_j30, trigger_date_j15)
             VALUES (?, ?, 'pending', ?, ?, ?)
             ON DUPLICATE KEY UPDATE renewal_year = VALUES(renewal_year)",
            [
                $policyId,
                (int) $expiry->format('Y'),
                $expiry->modify('-45 days')->format('Y-m-d'),
                $expiry->modify('-30 days')->format('Y-m-d'),
                $expiry->modify('-15 days')->format('Y-m-d'),
            ]
        );

        return (int) $this->db->lastInsertId();
    }

    private function sendRenewalMessage(string $templateKey, int $renewalId, array $context): void
    {
        $renewal = $this->db->fetchOne('SELECT policy_id FROM renewals WHERE id = ?', [$renewalId]);
        $policy  = $renewal
            ? $this->db->fetchOne('SELECT client_id FROM policies WHERE id = ?', [$renewal['policy_id']])
            : null;

        $this->notif->send(
            templateKey:   $templateKey,
            context:       $context,
            clientId:      (int) ($policy['client_id'] ?? 0),
            renewalId:     $renewalId
        );
    }

    private function notifyAgentEscalation(int $renewalId, array $context, string $reason): void
    {
        // In-app notification and email to assigned agent
        // Wired to a future InAppNotification table or agent email directly
        $subject = "[$reason] Client {$context['client_name']} — {$context['policy_type']}";
        $body    = "Renewal ID $renewalId for client {$context['client_name']} "
                 . "({$context['policy_type']}, expires {$context['expiry_date']}) requires your attention.\n"
                 . "Reason: $reason\n"
                 . "Premium at risk: MUR {$context['premium_amount']}";

        // Log as inbound for agent's queue — full in-app system is Phase 1 UI work
        $this->db->execute(
            "INSERT INTO communications
                (client_id, renewal_id, channel, direction, template_key, subject, body, status, created_at)
             SELECT c.id, ?, 'in_app', 'outbound', 'agent_escalation', ?, ?, 'queued', NOW()
             FROM renewals r
             JOIN policies p ON p.id = r.policy_id
             JOIN clients  c ON c.id = p.client_id
             WHERE r.id = ?",
            [$renewalId, $subject, $body, $renewalId]
        );
    }

    private function audit(int $renewalId, string $action, array $context): void
    {
        $summary = array_intersect_key($context, array_flip([
            'client_name', 'policy_type', 'expiry_date', 'premium_amount',
        ]));

        $this->db->execute(
            "INSERT INTO audit_log
                (actor_user_id, entity_type, entity_id, action, new_values_json, occurred_at)
             VALUES (NULL, 'renewal', ?, ?, ?, NOW())",
            [$renewalId, $action, json_encode($summary)]
        );
    }
}
