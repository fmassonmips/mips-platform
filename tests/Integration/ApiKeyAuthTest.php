<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Services\ApiKeyService;

final class ApiKeyAuthTest extends IntegrationTestCase
{
    /** @return array{string,string} [key_id, secret] */
    private function issueKey(int $merchantId): array
    {
        $key = ApiKeyService::make()->create($merchantId, 'test key');
        return [$key['key_id'], $key['secret']];
    }

    private function sign(string $secret, string $ts, string $method, string $target, string $body): string
    {
        return hash_hmac('sha256', $ts . "\n" . strtoupper($method) . "\n" . $target . "\n" . $body, $secret);
    }

    public function testValidSignatureAuthenticatesMerchant(): void
    {
        $m = $this->seedMerchant();
        [$keyId, $secret] = $this->issueKey($m['merchant_id']);

        $ts = (string) time();
        $sig = $this->sign($secret, $ts, 'POST', '/api/v1/links', '{}');

        $merchant = ApiKeyService::make()->authenticate('POST', '/api/v1/links', '{}', [
            'X-Api-Key'   => $keyId,
            'X-Timestamp' => $ts,
            'X-Signature' => $sig,
        ]);

        self::assertIsArray($merchant);
        self::assertSame($m['merchant_id'], (int) $merchant['id']);
    }

    public function testTamperedBodyFailsVerification(): void
    {
        $m = $this->seedMerchant();
        [$keyId, $secret] = $this->issueKey($m['merchant_id']);
        $ts = (string) time();
        $sig = $this->sign($secret, $ts, 'POST', '/api/v1/links', '{}');

        // Body differs from what was signed.
        $merchant = ApiKeyService::make()->authenticate('POST', '/api/v1/links', '{"amount":"1.00"}', [
            'X-Api-Key'   => $keyId,
            'X-Timestamp' => $ts,
            'X-Signature' => $sig,
        ]);
        self::assertNull($merchant);
    }

    public function testExpiredTimestampIsRejected(): void
    {
        $m = $this->seedMerchant();
        [$keyId, $secret] = $this->issueKey($m['merchant_id']);
        $ts = (string) (time() - 10000); // well outside the TTL window
        $sig = $this->sign($secret, $ts, 'GET', '/api/v1/transactions', '');

        $merchant = ApiKeyService::make()->authenticate('GET', '/api/v1/transactions', '', [
            'X-Api-Key'   => $keyId,
            'X-Timestamp' => $ts,
            'X-Signature' => $sig,
        ]);
        self::assertNull($merchant);
    }

    public function testRevokedKeyIsRejected(): void
    {
        $m = $this->seedMerchant();
        [$keyId, $secret] = $this->issueKey($m['merchant_id']);
        ApiKeyService::make()->revoke($m['merchant_id'], $keyId);

        $ts = (string) time();
        $sig = $this->sign($secret, $ts, 'GET', '/api/v1/transactions', '');
        $merchant = ApiKeyService::make()->authenticate('GET', '/api/v1/transactions', '', [
            'X-Api-Key'   => $keyId,
            'X-Timestamp' => $ts,
            'X-Signature' => $sig,
        ]);
        self::assertNull($merchant);
    }
}
