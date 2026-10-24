<?php
/**
 * Authenticated encryption of secrets stored in the database
 * (libsodium secretbox, key = config app.secret_key).
 */
declare(strict_types=1);

namespace App;

use RuntimeException;

final class Secrets
{
    public static function encrypt(string $plain): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, self::key()));
    }

    public static function decrypt(string $stored): string
    {
        $raw = base64_decode($stored, true);
        if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            throw new RuntimeException('Stored secret is malformed.');
        }
        $plain = sodium_crypto_secretbox_open(
            substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            self::key()
        );
        if ($plain === false) {
            throw new RuntimeException('Stored secret cannot be decrypted (was app.secret_key changed?).');
        }
        return $plain;
    }

    public static function isConfigured(): bool
    {
        $key = base64_decode((string) ($GLOBALS['config']['app']['secret_key'] ?? ''), true);
        return $key !== false && strlen($key) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES;
    }

    private static function key(): string
    {
        if (!self::isConfigured()) {
            throw new RuntimeException('app.secret_key is not configured (32 random bytes, base64).');
        }
        return (string) base64_decode((string) $GLOBALS['config']['app']['secret_key'], true);
    }
}
