<?php
/**
 * Merchant (machine-to-machine) API, authenticated by HMAC request signing.
 * No session/CSRF here — the signature is the credential.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Response;
use App\Services\PaymentLinkService;
use App\Support\ApiAuth;
use App\Support\Money;
use RuntimeException;

final class MerchantApiController
{
    /** POST /api/v1/links  { amount?, currency?, description?, max_uses?, expires_at? } */
    public function createLink(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        [$merchant, $rawBody] = ApiAuth::requireMerchant();

        $data = json_decode($rawBody, true);
        if (!is_array($data)) {
            $data = [];
        }

        try {
            $link = PaymentLinkService::make()->createForMerchant($merchant, $data);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json([
            'link_reference' => $link['link_reference'],
            'pay_url'        => '/pay.php?link=' . $link['slug'],
            'amount_minor'   => $link['amount_minor'] !== null ? (int) $link['amount_minor'] : null,
            'currency'       => $link['currency'],
            'status'         => $link['status'],
        ], 201);
    }

    /** GET /api/v1/transactions?ref=TXN_...  (scoped to the calling merchant) */
    public function getTransaction(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        [$merchant] = ApiAuth::requireMerchant();

        $ref = isset($_GET['ref']) ? (string) $_GET['ref'] : '';
        $stmt = Database::connection()->prepare(
            'SELECT * FROM transactions WHERE transaction_reference = :r AND merchant_id = :m LIMIT 1'
        );
        $stmt->execute([':r' => $ref, ':m' => (int) $merchant['id']]);
        $t = $stmt->fetch();
        if (!is_array($t)) {
            Response::json(['error' => 'Transaction not found.'], 404);
        }

        Response::json([
            'transaction_reference'    => $t['transaction_reference'],
            'regulated_transaction_id' => $t['regulated_transaction_id'],
            'payment_type'             => $t['payment_type'],
            'amount_minor'             => (int) $t['amount_minor'],
            'amount_display'           => Money::format((int) $t['amount_minor'], (string) $t['currency']),
            'currency'                 => $t['currency'],
            'status'                   => $t['status'],
            'reconciliation_status'    => $t['reconciliation_status'],
            'created_at'               => $t['created_at'],
        ]);
    }
}
