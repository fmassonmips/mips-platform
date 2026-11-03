<?php
/**
 * Symmetric encryption with the application key (libsodium secretbox).
 * Used for secrets that must be read back, e.g. TOTP seeds.
 */
declare(strict_types=1);

namespace App;

use RuntimeException;

final class Crypto
{
    public static function encrypt(string $plain): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return $nonce . sodium_crypto_secretbox($plain, $nonce, self::key());
    }

    public static function decrypt(string $cipher): string
    {
        $nonce = substr($cipher, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $box   = substr($cipher, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = sodium_crypto_secretbox_open($box, $nonce, self::key());
        if ($plain === false) {
            throw new RuntimeException('Cannot decrypt: wrong application key or corrupted data.');
        }
        return $plain;
    }

    public static function configured(): bool
    {
        $key = base64_decode((string) ($GLOBALS['config']['security']['app_key'] ?? ''), true);
        return is_string($key) && strlen($key) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES;
    }

    private static function key(): string
    {
        if (!self::configured()) {
            throw new RuntimeException('security.app_key is not configured (run tools/make_app_key.php).');
        }
        return (string) base64_decode((string) $GLOBALS['config']['security']['app_key'], true);
    }
}
