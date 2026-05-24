<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;

class WebhookController
{
    public static function handle(): void
    {
        $rawBody = (string) file_get_contents('php://input');
        $sig     = $_SERVER['HTTP_X_MIPS_SIGNATURE'] ?? '';

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON payload']);
            return;
        }

        $reference = (string) ($payload['reference'] ?? '');
        $status    = (string) ($payload['status'] ?? '');

        if ($reference === '' || $status === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing reference or status']);
            return;
        }

        $db   = Database::getInstance();
        $link = $db->fetchOne(
            'SELECT pl.*, pol.client_id, c.brokerage_id
             FROM payment_links pl
             JOIN policies pol ON pol.id = pl.policy_id
             JOIN clients c ON c.id = pol.client_id
             WHERE pl.reference = ?',
            [$reference]
        );

        if (!$link) {
            http_response_code(404);
            echo json_encode(['error' => 'Payment reference not found']);
            return;
        }

        // Verify HMAC with the brokerage's MIPS key
        try {
            $mips = new \App\Services\MipsService((int) $link['brokerage_id']);
            if ($sig !== '' && !$mips->verifyWebhookSignature($rawBody, $sig)) {
                http_response_code(401);
                echo json_encode(['error' => 'Signature mismatch']);
                return;
            }
        } catch (\Throwable $e) {
            error_log('[WebhookController] signature check failed: ' . $e->getMessage());
        }

        $newStatus = match ($status) {
            'PAID', 'paid', 'success' => 'paid',
            'EXPIRED', 'expired'      => 'expired',
            'CANCELLED', 'cancelled'  => 'cancelled',
            default                   => null,
        };

        if ($newStatus === null) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'note' => 'status ignored']);
            return;
        }

        $db->execute(
            "UPDATE payment_links SET status = ?, paid_at = IF(? = 'paid', NOW(), NULL), updated_at = NOW() WHERE id = ?",
            [$newStatus, $newStatus, (int) $link['id']]
        );

        // When paid, mark the renewal as paid too
        if ($newStatus === 'paid') {
            $db->execute(
                "UPDATE renewals SET status = 'paid', updated_at = NOW()
                 WHERE policy_id = ? AND status NOT IN ('paid','cancelled')
                 ORDER BY id DESC LIMIT 1",
                [(int) $link['policy_id']]
            );

            // Log the payment event
            $db->execute(
                "INSERT INTO payment_events (payment_link_id, event_type, amount, raw_payload)
                 VALUES (?, 'payment_received', ?, ?)",
                [(int) $link['id'], (float) ($payload['amount'] ?? $link['amount']), $rawBody]
            );
        }

        http_response_code(200);
        echo json_encode(['ok' => true]);
    }
}
