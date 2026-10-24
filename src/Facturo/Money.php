<?php
/**
 * Integer money arithmetic for Facturo. Amounts are always cents (int),
 * quantities thousandths (int), tax rates basis points (int, 15% = 1500).
 * No floats touch an amount.
 */
declare(strict_types=1);

namespace App\Facturo;

final class Money
{
    public const CURRENCIES = ['MUR', 'EUR', 'USD'];

    public const MAX_QUANTITY_MILLI = 1_000_000_000;   // 1,000,000 units
    public const MAX_UNIT_CENTS     = 1_000_000_000;   // 10,000,000.00

    /** "1234.5" → 123450, null when not a valid amount (max 2 decimals). */
    public static function parseCents(string $value): ?int
    {
        if (!preg_match('/^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/', $value, $m)) {
            return null;
        }
        $cents = (int) $m[2] * 100 + (int) str_pad($m[3] ?? '', 2, '0');
        return $m[1] === '-' ? -$cents : $cents;
    }

    /** "1.5" → 1500 (thousandths), null when invalid (max 3 decimals). */
    public static function parseQuantity(string $value): ?int
    {
        if (!preg_match('/^(\d{1,7})(?:\.(\d{1,3}))?$/', $value, $m)) {
            return null;
        }
        return (int) $m[1] * 1000 + (int) str_pad($m[2] ?? '', 3, '0');
    }

    /** "15" / "15.5" → 1500 / 1550 basis points, null when invalid or > 100%. */
    public static function parseRate(string $value): ?int
    {
        if (!preg_match('/^(\d{1,3})(?:\.(\d{1,2}))?$/', $value, $m)) {
            return null;
        }
        $bp = (int) $m[1] * 100 + (int) str_pad($m[2] ?? '', 2, '0');
        return $bp <= 10000 ? $bp : null;
    }

    /**
     * Line amounts: [total excl. tax, tax], both rounded half away from zero.
     *
     * @return array{0:int,1:int}
     */
    public static function line(int $quantityMilli, int $unitCents, int $rateBp): array
    {
        $total = self::mulDivRound($quantityMilli, $unitCents, 1000);
        $sign  = $total < 0 ? -1 : 1;
        $tax   = $sign * self::mulDivRound(abs($total), $rateBp, 10000);
        return [$total, $tax];
    }

    /** 123450, 'MUR' → "MUR 1,234.50" */
    public static function format(int $cents, string $currency): string
    {
        $sign = $cents < 0 ? '-' : '';
        $abs  = abs($cents);
        return $currency . ' ' . $sign . number_format(intdiv($abs, 100)) . '.' . str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }

    /** 123450 → "1234.50" (form input value) */
    public static function toInput(int $cents): string
    {
        $sign = $cents < 0 ? '-' : '';
        $abs  = abs($cents);
        return $sign . intdiv($abs, 100) . '.' . str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }

    /** 1500 → "1.5" */
    public static function quantityToInput(int $milli): string
    {
        $frac = rtrim(str_pad((string) ($milli % 1000), 3, '0', STR_PAD_LEFT), '0');
        return intdiv($milli, 1000) . ($frac !== '' ? '.' . $frac : '');
    }

    /** 1550 → "15.5" */
    public static function rateToInput(int $bp): string
    {
        $frac = rtrim(str_pad((string) ($bp % 100), 2, '0', STR_PAD_LEFT), '0');
        return intdiv($bp, 100) . ($frac !== '' ? '.' . $frac : '');
    }

    /**
     * round($a * $b / $d) without overflow for $a >= 0, $d > 0, half away from zero.
     */
    private static function mulDivRound(int $a, int $b, int $d): int
    {
        $q   = intdiv($a, $d);
        $num = ($a % $d) * $b;
        $rem = $num >= 0 ? intdiv(2 * $num + $d, 2 * $d) : -intdiv(-2 * $num + $d, 2 * $d);
        return $q * $b + $rem;
    }
}
