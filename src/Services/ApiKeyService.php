<?php
/**
 * Merchant API keys with HMAC request signing.
 *
 * Issuance returns the secret exactly ONCE. At rest we keep:
 *   - key_hash         : sha256(secret), for integrity / constant-time lookup
 *   - secret_encrypted : AES-256-GCM(secret), so the server can recompute HMAC
 *
 * Request signing (client side):
 *   signing_string = timestamp "\n" METHOD "\n" request_target "\n" raw_body
 *   X-Api-Key:   <key_id>
 *   X-Timestamp: <unix seconds>
 *   X-Signature: hex( HMAC-SHA256(signing_string, secret) )
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Support\Crypto;
use PDO;
use RuntimeException;

final class ApiKeyService
{
    public function __construct(private readonly PDO $db)
    {
    }

    public static function make(): self
    {
        return new self(Database::connection());
    }

    /**
     * Issue a new key for a merchant. The plaintext secret is returned ONCE.
     *
     * @return array{key_id:string,secret:string,label:?string}
     */
    public function create(int $merchantId, ?string $label = null, ?string $scopes = null): array
    {
        $keyId  = 'pk_' . bin2hex(random_bytes(10));
        $secret = 'sk_' . bin2hex(random_bytes(24));

        $stmt = $this->db->prepare(
            'INSERT INTO api_keys (merchant_id, key_id, key_hash, secret_encrypted, label, scopes, is_active, created_at)
             VALUES (:mid, :kid, :hash, :enc, :label, :scopes, 1, NOW())'
        );
        $stmt->execute([
            ':mid'    => $merchantId,
            ':kid'    => $keyId,
            ':hash'   => hash('sha256', $secret),
            ':enc'    => Crypto::encrypt($secret),
            ':label'  => $label,
            ':scopes' => $scopes,
        ]);

        return ['key_id' => $keyId, 'secret' => $secret, 'label' => $label];
    }

    /** @return list<array<string,mixed>> Keys for a merchant (never the secret). */
    public function listForMerchant(int $merchantId): array
    {
        $stmt = $this->db->prepare(
            'SELECT key_id, label, scopes, last_used_at, is_active, created_at, revoked_at
               FROM api_keys WHERE merchant_id = :m ORDER BY id DESC'
        );
        $stmt->execute([':m' => $merchantId]);
        return $stmt->fetchAll();
    }

    public function revoke(int $merchantId, string $keyId): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE api_keys SET is_active = 0, revoked_at = NOW()
              WHERE merchant_id = :m AND key_id = :k AND is_active = 1'
        );
        $stmt->execute([':m' => $merchantId, ':k' => $keyId]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Verify a signed request and return the owning merchant row, or null.
     *
     * @param array<string,string> $headers Case-insensitive header map.
     * @return array<string,mixed>|null
     */
    public function authenticate(string $method, string $requestTarget, string $rawBody, array $headers): ?array
    {
        $keyId = $this->header($headers, 'X-Api-Key');
        $ts    = $this->header($headers, 'X-Timestamp');
        $sig   = $this->header($headers, 'X-Signature');
        if ($keyId === '' || $ts === '' || $sig === '') {
            return null;
        }

        // Replay window.
        $ttl = (int) ($GLOBALS['config']['security']['api_signature_ttl'] ?? 300);
        if (!ctype_digit($ts) || abs(time() - (int) $ts) > $ttl) {
            return null;
        }

        $row = $this->findActiveKey($keyId);
        if ($row === null || $row['secret_encrypted'] === null) {
            return null;
        }

        try {
            $secret = Crypto::decrypt((string) $row['secret_encrypted']);
        } catch (RuntimeException) {
            return null;
        }

        $signingString = $ts . "\n" . strtoupper($method) . "\n" . $requestTarget . "\n" . $rawBody;
        $expected      = hash_hmac('sha256', $signingString, $secret);
        if (!hash_equals($expected, $sig)) {
            return null;
        }

        $this->touch($keyId);
        return $this->merchant((int) $row['merchant_id']);
    }

    /** @return array<string,mixed>|null */
    private function findActiveKey(string $keyId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT merchant_id, secret_encrypted FROM api_keys
              WHERE key_id = :k AND is_active = 1 AND revoked_at IS NULL LIMIT 1'
        );
        $stmt->execute([':k' => $keyId]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    private function touch(string $keyId): void
    {
        $this->db->prepare('UPDATE api_keys SET last_used_at = NOW() WHERE key_id = :k')->execute([':k' => $keyId]);
    }

    /** @return array<string,mixed>|null */
    private function merchant(int $merchantId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $merchantId]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /** @param array<string,string> $headers */
    private function header(array $headers, string $name): string
    {
        foreach ($headers as $k => $v) {
            if (strcasecmp($k, $name) === 0) {
                return (string) $v;
            }
        }
        return '';
    }
}
