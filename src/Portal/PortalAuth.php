<?php
/**
 * Merchant portal authentication. Merchant accounts live in portal_users,
 * apart from staff users, and use their own session cookie (see bootstrap).
 *
 * Every portal page and API goes through PortalAuth::require(), which also
 * enforces the gates in order: two-factor enrolment, then acceptance of the
 * current terms of use.
 */
declare(strict_types=1);

namespace App\Portal;

use App\Database;
use App\Response;
use App\Session;

final class PortalAuth
{
    private const DUMMY_HASH = '$2y$12$5CpDbcYUSvJ.4yNwoJQ85uzydC4Bvb9TJHcW/jkX7PqTX6TYsm4ri';
    private const COLUMNS    = 'id, email, name, phone, is_active, email_verified_at, password_changed_at, totp_enabled_at, last_login_at, created_at';

    /**
     * Check credentials. Returns the account row (password hash removed) or
     * null. The caller checks is_active / email_verified_at.
     *
     * @return array<string,mixed>|null
     */
    public static function attempt(string $email, string $password): ?array
    {
        $stmt = Database::connection()->prepare('SELECT ' . self::COLUMNS . ', password_hash FROM portal_users WHERE email = :e');
        $stmt->execute([':e' => $email]);
        $user = $stmt->fetch();
        $ok   = password_verify($password, is_array($user) ? (string) $user['password_hash'] : self::DUMMY_HASH);
        if (!is_array($user) || !$ok) {
            return null;
        }
        if (password_needs_rehash((string) $user['password_hash'], PASSWORD_DEFAULT)) {
            Database::connection()->prepare('UPDATE portal_users SET password_hash = :h WHERE id = :id')
                ->execute([':h' => password_hash($password, PASSWORD_DEFAULT), ':id' => (int) $user['id']]);
        }
        unset($user['password_hash']);
        return $user;
    }

    /** @param array<string,mixed> $user */
    public static function login(array $user): void
    {
        Session::regenerate();
        unset($_SESSION['portal_2fa_pending'], $_SESSION['portal_totp_setup']);
        $_SESSION['portal_user_id'] = (int) $user['id'];
        $_SESSION['portal_email']   = (string) $user['email'];
        $_SESSION['portal_pwd_at']  = (string) ($user['password_changed_at'] ?? '');
        $_SESSION['portal_ua']      = self::userAgentHash();
        unset($_SESSION['csrf_token']);
        Database::connection()->prepare('UPDATE portal_users SET last_login_at = NOW() WHERE id = :id')->execute([':id' => (int) $user['id']]);
    }

    public static function logout(): void
    {
        Session::destroy();
    }

    /** @return array<string,mixed>|null */
    public static function current(): ?array
    {
        if (empty($_SESSION['portal_user_id'])) {
            return null;
        }
        if (($_SESSION['portal_ua'] ?? '') !== self::userAgentHash()) {
            self::logout();
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT ' . self::COLUMNS . ' FROM portal_users WHERE id = :id AND is_active = 1 AND email_verified_at IS NOT NULL'
        );
        $stmt->execute([':id' => (int) $_SESSION['portal_user_id']]);
        $user = $stmt->fetch();
        if (!is_array($user) || (string) ($user['password_changed_at'] ?? '') !== (string) ($_SESSION['portal_pwd_at'] ?? '')) {
            self::logout();
            return null;
        }
        return $user;
    }

    /**
     * Signed-in merchant, without the enrolment / terms gates (used by the
     * security and terms pages themselves).
     *
     * @return array<string,mixed>
     */
    public static function requireUser(): array
    {
        $user = self::current();
        if ($user !== null) {
            return $user;
        }
        if (self::isApi()) {
            Response::json(['error' => 'Unauthorized'], 401);
        }
        header('Location: /portal/login.php');
        exit;
    }

    /**
     * Signed-in merchant who has set up two-factor authentication and
     * accepted the current terms of use.
     *
     * @return array<string,mixed>
     */
    public static function require(): array
    {
        $user = self::requireUser();
        if (empty($user['totp_enabled_at'])) {
            self::deny('Set up two-factor authentication first.', '/portal/security.php?enroll=1');
        }
        $terms = Terms::current();
        if ($terms === null) {
            self::deny('The portal is not open yet: the terms of use have not been published.', '/portal/terms.php');
        }
        if (!Terms::hasAccepted((int) $user['id'], (int) $terms['id'])) {
            self::deny('Please read and accept the terms of use.', '/portal/terms.php');
        }
        return $user;
    }

    /**
     * Actor written to the audit log for merchant actions. The id is null
     * (merchants are not staff users); the email is prefixed "portal:".
     *
     * @param array<string,mixed> $user
     * @return array{id:null, email:string}
     */
    public static function actor(array $user): array
    {
        return ['id' => null, 'email' => 'portal:' . $user['email']];
    }

    public static function isApi(): bool
    {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        return str_starts_with($uri, '/api/') || str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json');
    }

    private static function deny(string $message, string $redirect): never
    {
        if (self::isApi()) {
            Response::json(['error' => $message, 'redirect' => $redirect], 403);
        }
        header('Location: ' . $redirect);
        exit;
    }

    private static function userAgentHash(): string
    {
        return hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? '');
    }
}
