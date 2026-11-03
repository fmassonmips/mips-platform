<?php
/**
 * CSRF protection via a per-session synchronizer token.
 *
 * The SameSite=Lax cookie already blocks most cross-site POSTs, but this
 * token adds belt-and-suspenders defense for state-changing endpoints.
 */
declare(strict_types=1);

namespace App;

final class Csrf
{
    /**
     * Get the current CSRF token, creating one if it doesn't exist yet.
     */
    public static function token(): string
    {
        if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }

    /**
     * Constant-time comparison against the session token.
     */
    public static function verify(?string $token): bool
    {
        if (!is_string($token) || $token === '' || empty($_SESSION['csrf_token'])) {
            return false;
        }
        return hash_equals((string) $_SESSION['csrf_token'], $token);
    }
}
