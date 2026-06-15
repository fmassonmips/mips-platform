<?php
/**
 * Money is stored and moved as integer MINOR units (e.g. cents) to avoid
 * floating-point drift. Default currency for the MVP is MUR (Mauritian Rupee).
 *
 * Never use floats for arithmetic on money — only for display formatting.
 */
declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;

final class Money
{
    public const DEFAULT_CURRENCY = 'MUR';

    /** Minor-unit exponent per currency (most are 2; extend as needed). */
    private const EXPONENTS = [
        'MUR' => 2,
        'USD' => 2,
        'EUR' => 2,
        'ZAR' => 2,
    ];

    /** Convert a major-unit amount (e.g. "1500.50") to integer minor units. */
    public static function toMinor(string $major, string $currency = self::DEFAULT_CURRENCY): int
    {
        if (!preg_match('/^-?\d+(\.\d+)?$/', $major)) {
            throw new InvalidArgumentException('Invalid amount: ' . $major);
        }
        $exp   = self::EXPONENTS[strtoupper($currency)] ?? 2;
        $parts = explode('.', $major);
        $whole = (int) $parts[0];
        $frac  = str_pad(substr($parts[1] ?? '', 0, $exp), $exp, '0');
        $sign  = $whole < 0 ? -1 : 1;

        return $sign * ((abs($whole) * (10 ** $exp)) + (int) $frac);
    }

    /** Format integer minor units for display, e.g. 150050 -> "1,500.50". */
    public static function format(int $minor, string $currency = self::DEFAULT_CURRENCY): string
    {
        $exp = self::EXPONENTS[strtoupper($currency)] ?? 2;
        return number_format($minor / (10 ** $exp), $exp);
    }

    public static function isSupported(string $currency): bool
    {
        return isset(self::EXPONENTS[strtoupper($currency)]);
    }
}
