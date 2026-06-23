<?php
/**
 * Lightweight, deterministic server-side validators.
 * Never trust anything that didn't come from here on the server.
 */
declare(strict_types=1);

namespace App;

final class Validator
{
    /** Returns null when valid, an error message otherwise. */
    public static function email(string $email): ?string
    {
        $email = trim($email);
        if ($email === '') {
            return 'Email is required.';
        }
        if (strlen($email) > 254) {
            return 'Email is too long.';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'Email format is invalid.';
        }
        return null;
    }

    /** Returns null when valid, an error message otherwise. */
    public static function password(string $password, int $minLength = 8): ?string
    {
        if ($password === '') {
            return 'Password is required.';
        }
        if (strlen($password) < $minLength) {
            return 'Password must be at least ' . $minLength . ' characters.';
        }
        if (strlen($password) > 255) {
            return 'Password is too long.';
        }
        return null;
    }

    /** Returns null when valid, an error message otherwise. */
    public static function name(string $name): ?string
    {
        $name = trim($name);
        if ($name === '') {
            return 'Name is required.';
        }
        if (strlen($name) > 120) {
            return 'Name must be no more than 120 characters.';
        }
        return null;
    }

    /**
     * Inflow only accepts EUR or USD. Returns null when valid.
     */
    public static function currency(string $currency): ?string
    {
        if (!in_array($currency, ['EUR', 'USD'], true)) {
            return 'Currency must be one of: EUR, USD.';
        }
        return null;
    }

    /** ISO 3166-1 alpha-2 country code (two uppercase letters). */
    public static function country(string $code): ?string
    {
        if (!preg_match('/^[A-Z]{2}$/', $code)) {
            return 'Billing country must be a two-letter ISO country code.';
        }
        return null;
    }

    /**
     * Validate the products array and return the total amount in cents via
     * $totalCents. Each product needs a non-empty name, a positive integer
     * price (in cents) and a positive integer quantity.
     *
     * Returns null when valid, an error message otherwise.
     *
     * @param mixed $products
     */
    public static function products(mixed $products, ?int &$totalCents = null): ?string
    {
        $totalCents = 0;

        if (!is_array($products) || $products === []) {
            return 'At least one product is required.';
        }

        foreach ($products as $product) {
            if (!is_array($product)) {
                return 'Each product must be an object.';
            }

            $pname = is_string($product['name'] ?? null) ? trim((string) $product['name']) : '';
            if ($pname === '' || strlen($pname) > 255) {
                return 'Each product needs a name (max 255 characters).';
            }

            // price and quantity must be whole positive numbers.
            if (!self::isPositiveInt($product['price'] ?? null)) {
                return 'Each product price must be a positive integer (in cents).';
            }
            if (!self::isPositiveInt($product['quantity'] ?? null)) {
                return 'Each product quantity must be a positive integer.';
            }

            $totalCents += (int) $product['price'] * (int) $product['quantity'];
        }

        return null;
    }

    /**
     * Basic, network-agnostic sanity checks on raw card data before we forward
     * it to Inflow. We do NOT brand-detect or fully Luhn-validate here — the
     * provider is authoritative — but we reject obvious garbage early.
     *
     * @param mixed $card
     */
    public static function card(mixed $card): ?string
    {
        if (!is_array($card)) {
            return 'Card details are required.';
        }

        $number = is_string($card['number'] ?? null) ? preg_replace('/\s+/', '', (string) $card['number']) : '';
        if ($number === '' || !preg_match('/^[0-9]{12,19}$/', $number)) {
            return 'Card number is invalid.';
        }
        if (!self::luhn($number)) {
            return 'Card number is invalid.';
        }

        $month = isset($card['expMonth']) ? (int) $card['expMonth'] : 0;
        if ($month < 1 || $month > 12) {
            return 'Card expiry month is invalid.';
        }

        $year = isset($card['expYear']) ? (int) $card['expYear'] : 0;
        // Accept either two- or four-digit years.
        if ($year < 100) {
            $year += 2000;
        }
        $currentYear = (int) date('Y');
        if ($year < $currentYear || $year > $currentYear + 20) {
            return 'Card expiry year is invalid.';
        }

        $cvc = is_string($card['cvc'] ?? null) ? (string) $card['cvc'] : (string) ($card['cvc'] ?? '');
        if (!preg_match('/^[0-9]{3,4}$/', $cvc)) {
            return 'Card security code is invalid.';
        }

        return null;
    }

    private static function isPositiveInt(mixed $value): bool
    {
        if (is_int($value)) {
            return $value > 0;
        }
        // Accept integer-valued strings/floats, reject decimals like "1.5".
        if (is_string($value) && preg_match('/^[0-9]+$/', $value)) {
            return (int) $value > 0;
        }
        if (is_float($value)) {
            return $value > 0 && floor($value) === $value;
        }
        return false;
    }

    /** Luhn checksum used by all major card networks. */
    private static function luhn(string $number): bool
    {
        $sum    = 0;
        $alt    = false;
        for ($i = strlen($number) - 1; $i >= 0; $i--) {
            $digit = (int) $number[$i];
            if ($alt) {
                $digit *= 2;
                if ($digit > 9) {
                    $digit -= 9;
                }
            }
            $sum += $digit;
            $alt = !$alt;
        }
        return $sum % 10 === 0;
    }
}
