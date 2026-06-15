<?php
/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets that must be
 * recoverable at rest — e.g. API signing secrets, which the server needs to
 * recompute HMAC signatures (so a one-way hash is not enough).
 *
 * The key comes from APP_KEY (base64 of 32 bytes). In sandbox, a deterministic
 * development key is derived if APP_KEY is unset; in production a missing/short
 * key is a hard error.
 */
declare(strict_types=1);

namespace App\Support;

use RuntimeException;

final class Crypto
{
    private const CIPHER = 'aes-256-gcm';

    public static function encrypt(string $plaintext): string
    {
        $key = self::key();
        $iv  = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plaintext, self::CIPHER, $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Encryption failed.');
        }
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(string $blob): string
    {
        $raw = base64_decode($blob, true);
        if ($raw === false || strlen($raw) < 28) {
            throw new RuntimeException('Invalid ciphertext.');
        }
        $iv     = substr($raw, 0, 12);
        $tag    = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain  = openssl_decrypt($cipher, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($plain === false) {
            throw new RuntimeException('Decryption failed (key mismatch or tampered data).');
        }
        return $plain;
    }

    private static function key(): string
    {
        $configured = (string) ($GLOBALS['config']['security']['app_key'] ?? '');
        if ($configured !== '') {
            $key = base64_decode($configured, true);
            if ($key !== false && strlen($key) === 32) {
                return $key;
            }
            throw new RuntimeException('APP_KEY must be base64 of exactly 32 bytes.');
        }

        // No key configured: only tolerated in sandbox with a derived dev key.
        $sandbox = (bool) ($GLOBALS['config']['platform']['sandbox'] ?? true);
        if (!$sandbox) {
            throw new RuntimeException('APP_KEY is required outside sandbox mode.');
        }
        return hash('sha256', 'passpass-sandbox-key', true); // 32 raw bytes
    }
}
