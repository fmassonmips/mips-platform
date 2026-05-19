<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use RuntimeException;

/**
 * Thin wrapper around the MIPS payment gateway API.
 *
 * MIPS (Mauritius Inter-Bank Payment System) provides a hosted payment page.
 * Brokers supply their merchant_id and api_key via the brokerage settings screen.
 * This service never stores card data — all sensitive handling happens on MIPS servers.
 *
 * Webhook verification: use verifyWebhookSignature() on every inbound webhook
 * before trusting any payment.success event.
 */
class MipsService
{
    private const MIPS_BASE_URL = 'https://api.mips.mu/v1';   // replace with live endpoint

    public function __construct(private readonly Database $db) {}

    /**
     * Create a hosted payment link and return the URL + MIPS transaction ref.
     *
     * @param array{amount: float, description: string, reference: string, brokerage_id?: int} $params
     * @return array{payment_url: string, transaction_ref: string}
     */
    public function createPaymentLink(array $params): array
    {
        $credentials = $this->resolveCredentials($params['brokerage_id'] ?? null);

        $payload = [
            'merchant_id' => $credentials['merchant_id'],
            'amount'      => number_format($params['amount'], 2, '.', ''),
            'currency'    => 'MUR',
            'description' => mb_substr($params['description'], 0, 255),
            'reference'   => $params['reference'],
            'return_url'  => $this->buildReturnUrl($params['reference']),
            'webhook_url' => $this->buildWebhookUrl(),
        ];

        $response = $this->post('/payment-links', $payload, $credentials['api_key']);

        if (empty($response['payment_url'])) {
            throw new RuntimeException('MIPS did not return a payment_url: ' . json_encode($response));
        }

        return [
            'payment_url'     => $response['payment_url'],
            'transaction_ref' => $response['transaction_ref'] ?? '',
        ];
    }

    /**
     * Verify an inbound MIPS webhook signature (HMAC-SHA256).
     * Call this before acting on any payment.success event.
     */
    public function verifyWebhookSignature(string $rawBody, string $signatureHeader, string $apiKey): bool
    {
        $expected = hash_hmac('sha256', $rawBody, $apiKey);
        return hash_equals($expected, strtolower($signatureHeader));
    }

    /**
     * Retrieve credentials from the brokerage record.
     * Falls back to environment variables for single-tenant deployments.
     */
    private function resolveCredentials(?int $brokerageId): array
    {
        if ($brokerageId !== null) {
            $row = $this->db->fetchOne(
                'SELECT mips_merchant_id, mips_api_key_encrypted FROM brokerages WHERE id = ?',
                [$brokerageId]
            );
            if ($row && $row['mips_merchant_id']) {
                return [
                    'merchant_id' => $row['mips_merchant_id'],
                    'api_key'     => $this->decrypt($row['mips_api_key_encrypted']),
                ];
            }
        }

        // Fallback to env (single-tenant / dev)
        $merchantId = $_ENV['MIPS_MERCHANT_ID'] ?? '';
        $apiKey     = $_ENV['MIPS_API_KEY'] ?? '';

        if (!$merchantId || !$apiKey) {
            throw new RuntimeException('MIPS credentials not configured.');
        }

        return ['merchant_id' => $merchantId, 'api_key' => $apiKey];
    }

    private function post(string $path, array $payload, string $apiKey): array
    {
        $ch = curl_init(self::MIPS_BASE_URL . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new RuntimeException('MIPS cURL error: ' . $err);
        }

        $data = json_decode($body ?: '{}', true);

        if ($code >= 400) {
            throw new RuntimeException(sprintf(
                'MIPS API returned HTTP %d: %s',
                $code,
                $data['message'] ?? $body
            ));
        }

        return $data;
    }

    private function buildReturnUrl(string $reference): string
    {
        $base = $_ENV['APP_URL'] ?? 'https://app.insurlink.mu';
        return $base . '/payment/return?ref=' . urlencode($reference);
    }

    private function buildWebhookUrl(): string
    {
        $base = $_ENV['APP_URL'] ?? 'https://app.insurlink.mu';
        return $base . '/webhook/mips';
    }

    private function decrypt(string $ciphertext): string
    {
        // AES-256-CBC decryption — key from APP_ENCRYPTION_KEY env var
        $key    = base64_decode($_ENV['APP_ENCRYPTION_KEY'] ?? '');
        $parts  = explode('::', base64_decode($ciphertext), 2);
        if (count($parts) !== 2) {
            throw new RuntimeException('Invalid encrypted credential format.');
        }
        [$iv, $encrypted] = $parts;
        $plain = openssl_decrypt($encrypted, 'AES-256-CBC', $key, 0, $iv);
        if ($plain === false) {
            throw new RuntimeException('Failed to decrypt MIPS API key.');
        }
        return $plain;
    }
}
