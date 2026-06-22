<?php
/**
 * Thin HTTP client for Inflow's server-to-server (S2S) payments API.
 *
 * Docs: https://docs.inflowpay.com/docs/server-to-server-payments
 *
 * Three operations are exposed, mapping directly onto the documented flow:
 *   - createPayment()  POST {card}/api/server/payment
 *   - confirmPayment() POST {api}/api/server/payment/{id}/confirm
 *   - getPayment()     GET  {api}/api/payment/{id}
 *
 * Card creation goes to the dedicated PCI-scoped host (card_base_url) while
 * confirmation/status use the main API host (api_base_url).
 *
 * SECURITY: request bodies may contain raw card data, so they are NEVER
 * written to the error log. Only the HTTP status and a generic message are
 * logged on failure.
 */
declare(strict_types=1);

namespace App;

use RuntimeException;

final class InflowPay
{
    /** @var array<string,mixed> */
    private array $cfg;

    /**
     * @param array<string,mixed>|null $config Inflow config block; defaults to $GLOBALS['config']['inflow'].
     */
    public function __construct(?array $config = null)
    {
        $this->cfg = $config ?? (array) ($GLOBALS['config']['inflow'] ?? []);

        if (($this->cfg['api_key'] ?? '') === '') {
            // Missing credentials is a server misconfiguration, not a client error.
            throw new RuntimeException('Inflow API key is not configured.');
        }
    }

    /**
     * Create a payment by sending customer, product and card details to the
     * PCI-scoped card endpoint.
     *
     * @param array<string,mixed> $payload
     * @return array{status:int,body:array<string,mixed>}
     */
    public function createPayment(array $payload): array
    {
        return $this->request(
            'POST',
            $this->url((string) $this->cfg['card_base_url'], '/api/server/payment'),
            $payload
        );
    }

    /**
     * Confirm a previously created payment (after 3-D Secure, or when the
     * deposit status indicates confirmation is required).
     *
     * @return array{status:int,body:array<string,mixed>}
     */
    public function confirmPayment(string $paymentId): array
    {
        return $this->request(
            'POST',
            $this->url(
                (string) $this->cfg['api_base_url'],
                '/api/server/payment/' . rawurlencode($paymentId) . '/confirm'
            )
        );
    }

    /**
     * Fetch the current state of a payment.
     *
     * @return array{status:int,body:array<string,mixed>}
     */
    public function getPayment(string $paymentId): array
    {
        return $this->request(
            'GET',
            $this->url(
                (string) $this->cfg['api_base_url'],
                '/api/payment/' . rawurlencode($paymentId)
            )
        );
    }

    // -- internals ----------------------------------------------------------

    private function url(string $base, string $path): string
    {
        return rtrim($base, '/') . $path;
    }

    /**
     * Perform a JSON request against Inflow and decode the response.
     *
     * @param array<string,mixed>|null $body
     * @return array{status:int,body:array<string,mixed>}
     */
    private function request(string $method, string $url, ?array $body = null): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Failed to initialise HTTP client.');
        }

        $headers = [
            'X-Inflow-Api-Key: ' . (string) $this->cfg['api_key'],
            'Accept: application/json',
        ];

        $opts = [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => (int) ($this->cfg['timeout'] ?? 30),
            CURLOPT_CONNECTTIMEOUT => 10,
            // Enforce TLS verification — these requests carry card data.
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];

        if ($body !== null) {
            $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $opts[CURLOPT_POSTFIELDS] = $json;
            $headers[] = 'Content-Type: application/json';
        }

        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);

        $raw    = curl_exec($ch);
        $errno  = curl_errno($ch);
        $error  = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $raw === false) {
            // Deliberately omit the URL/body to avoid leaking card data.
            error_log('[InflowPay] transport error (' . $errno . '): ' . $error);
            throw new RuntimeException('Payment provider is unreachable.');
        }

        $decoded = json_decode((string) $raw, true);
        $decoded = is_array($decoded) ? $decoded : [];

        return ['status' => $status, 'body' => $decoded];
    }
}
