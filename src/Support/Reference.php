<?php
/**
 * Human-readable, collision-resistant reference generator.
 *
 * Used for the regulated identifiers and merchant references that flow between
 * the platform, PassPass and the partner bank. Format: PREFIX_<base32 time><rand>
 * e.g. TXN_2F8Q3K9ZP4A1, MER_7H2N..., STL_..., RGT_... (regulated txn id).
 *
 * These are opaque correlation keys, not sequential PKs — safe to expose.
 */
declare(strict_types=1);

namespace App\Support;

final class Reference
{
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I,L,O,U)

    public static function generate(string $prefix, int $randomBytes = 8): string
    {
        $prefix = strtoupper(preg_replace('/[^A-Za-z]/', '', $prefix) ?? '');
        $time   = self::encode((int) (microtime(true) * 1000));
        $rand   = self::randomString($randomBytes);

        return sprintf('%s_%s%s', $prefix, $time, $rand);
    }

    public static function transaction(): string
    {
        return self::generate('TXN');
    }

    /** Identifier shared with the regulated entity (PassPass) for a transaction. */
    public static function regulatedTransaction(): string
    {
        return self::generate('RGT');
    }

    public static function merchant(): string
    {
        return self::generate('MER');
    }

    public static function settlement(): string
    {
        return self::generate('STL');
    }

    public static function batch(): string
    {
        return self::generate('BAT');
    }

    /** Provider-side reference fallback used by sandbox adapters. */
    public static function provider(string $providerName): string
    {
        $code = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $providerName) ?? 'PRV', 0, 3));
        return self::generate($code);
    }

    private static function encode(int $number): string
    {
        if ($number === 0) {
            return '0';
        }
        $out = '';
        while ($number > 0) {
            $out    = self::ALPHABET[$number % 32] . $out;
            $number = intdiv($number, 32);
        }
        return $out;
    }

    private static function randomString(int $bytes): string
    {
        $raw = random_bytes($bytes);
        $out = '';
        foreach (str_split($raw) as $byte) {
            $out .= self::ALPHABET[ord($byte) % 32];
        }
        return $out;
    }
}
