<?php
/**
 * RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s steps),
 * the format used by Google Authenticator, Microsoft Authenticator, 1Password...
 */
declare(strict_types=1);

namespace App;

final class Totp
{
    private const STEP   = 30;
    private const DIGITS = 6;
    private const B32    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** New random secret, base32 encoded (160 bits). */
    public static function newSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    public static function currentStep(?int $time = null): int
    {
        return intdiv($time ?? time(), self::STEP);
    }

    public static function code(string $secretB32, int $step): string
    {
        $hash   = hash_hmac('sha1', pack('J', $step), self::base32Decode($secretB32), true);
        $offset = ord($hash[19]) & 0x0f;
        $value  = ((ord($hash[$offset]) & 0x7f) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);
        return str_pad((string) ($value % 10 ** self::DIGITS), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /**
     * Return the matching step within +/- 1 step of now (clock drift), or null.
     * Steps <= $afterStep are rejected so a code cannot be replayed.
     */
    public static function match(string $secretB32, string $code, ?int $afterStep = null): ?int
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (!preg_match('/^\d{6}$/', $code)) {
            return null;
        }
        $now = self::currentStep();
        foreach ([$now - 1, $now, $now + 1] as $step) {
            if ($afterStep !== null && $step <= $afterStep) {
                continue;
            }
            if (hash_equals(self::code($secretB32, $step), $code)) {
                return $step;
            }
        }
        return null;
    }

    public static function uri(string $secretB32, string $account): string
    {
        $issuer = (string) ($GLOBALS['config']['security']['totp_issuer'] ?? 'MIPS Dashboard');
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account)
            . '?secret=' . $secretB32 . '&issuer=' . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=30';
    }

    private static function base32Encode(string $bin): string
    {
        $bits = '';
        foreach (str_split($bin) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::B32[bindec(str_pad($chunk, 5, '0'))];
        }
        return $out;
    }

    private static function base32Decode(string $b32): string
    {
        $b32  = strtoupper(rtrim($b32, '='));
        $bits = '';
        foreach (str_split($b32) as $c) {
            $i = strpos(self::B32, $c);
            if ($i !== false) {
                $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
            }
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }
        return $out;
    }
}
