<?php
/**
 * Shared behaviour for sandbox provider adapters.
 *
 * In the MVP every adapter runs in 'sandbox'/'stub' mode and SIMULATES the
 * downstream rail deterministically — no real money moves and no real PSP API
 * is called. The seams (config, HMAC verification, normalised results) are real,
 * so swapping in a live integration later is a localised change.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Support\Reference;

abstract class AbstractProvider
{
    /**
     * @param array<string,mixed> $config Provider config slice from config.php.
     */
    public function __construct(protected readonly array $config)
    {
    }

    abstract public function name(): string;

    protected function mode(): string
    {
        return (string) ($this->config['mode'] ?? 'sandbox');
    }

    protected function isLive(): bool
    {
        return $this->mode() === 'live';
    }

    protected function webhookSecret(): string
    {
        return (string) ($this->config['webhook_secret'] ?? '');
    }

    /** Deterministic sandbox provider reference for a payment. */
    protected function newProviderReference(): string
    {
        return Reference::provider($this->name());
    }

    /**
     * Verify an HMAC-SHA256 webhook signature in constant time.
     * Header format expected: hex digest of the raw body keyed with the secret.
     *
     * @param array<string,string> $headers
     */
    protected function verifySignature(string $rawBody, array $headers, string $headerName): bool
    {
        $secret = $this->webhookSecret();
        if ($secret === '') {
            // No secret configured: only acceptable in sandbox, and we say so.
            return !$this->isLive();
        }

        $provided = '';
        foreach ($headers as $key => $value) {
            if (strcasecmp($key, $headerName) === 0) {
                $provided = (string) $value;
                break;
            }
        }
        if ($provided === '') {
            return false;
        }

        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $provided);
    }
}
