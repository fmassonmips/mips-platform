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
}
