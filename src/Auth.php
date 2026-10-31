<?php
/**
 * Authentication helpers.
 *
 * Public API:
 *  - Auth::attempt(email, password) : returns the user row on success, null otherwise
 *  - Auth::login_user(user)         : binds the user to the current session (regenerates ID)
 *  - Auth::logout_user()            : destroys the session
 *  - Auth::current_user()           : returns the logged-in user (fresh from DB) or null
 *  - Auth::require_auth()           : enforces authentication, returns the user or exits
 *  - Auth::can(user, module)         : true if the user's role may access a module (config 'access')
 *  - Auth::require_access(module)    : require_auth() + can(), 403 otherwise;
 *                                      also sends users who must enrol in 2FA to /account.php
 */
declare(strict_types=1);

namespace App;

final class Auth
{
    // Pre-computed bcrypt hash used only to normalize timing when the email is unknown.
    // Password is a random string; this hash will never match any real password.
    private const DUMMY_HASH = '$2y$12$5CpDbcYUSvJ.4yNwoJQ85uzydC4Bvb9TJHcW/jkX7PqTX6TYsm4ri';

    /**
     * Verify credentials against the database.
     * Returns the user row (without password_hash) on success, null otherwise.
     *
     * @return array<string,mixed>|null
     */
    public static function attempt(string $email, string $password): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, email, password_hash, password_changed_at, name, role, is_active, totp_enabled_at
             FROM users
             WHERE email = :email
             LIMIT 1'
        );
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        // Always run password_verify exactly once, regardless of whether the
        // user exists. This keeps the response time roughly constant and
        // avoids leaking "does this email exist" via timing.
        $hashToCheck = is_array($user) ? (string) $user['password_hash'] : self::DUMMY_HASH;
        $isValid     = password_verify($password, $hashToCheck);

        if (!is_array($user) || (int) $user['is_active'] !== 1 || !$isValid) {
            return null;
        }

        // Opportunistic rehash if the cost factor has been bumped.
        if (password_needs_rehash((string) $user['password_hash'], PASSWORD_DEFAULT)) {
            $newHash = password_hash($password, PASSWORD_DEFAULT);
            $upd     = Database::connection()->prepare(
                'UPDATE users SET password_hash = :ph WHERE id = :id'
            );
            $upd->execute([':ph' => $newHash, ':id' => (int) $user['id']]);
        }

        unset($user['password_hash']);
        return $user;
    }

    /**
     * Bind the given user to the current session.
     * Regenerates the session ID to defeat session fixation.
     *
     * @param array<string,mixed> $user
     */
    public static function login_user(array $user): void
    {
        Session::regenerate();

        unset($_SESSION['2fa_pending']);
        $_SESSION['user_id']       = (int) $user['id'];
        $_SESSION['user_email']    = (string) $user['email'];
        // A later password change (here or elsewhere) ends this session.
        $_SESSION['pwd_at']        = (string) ($user['password_changed_at'] ?? '');
        $_SESSION['logged_in_at']  = time();
        $_SESSION['last_activity'] = time();
        // Bind to a hash of the User-Agent to make stolen-cookie replay harder.
        $_SESSION['ua_hash']       = self::userAgentHash();
    }

    /**
     * Destroy the current session entirely.
     */
    public static function logout_user(): void
    {
        Session::destroy();
    }

    /**
     * Return the currently logged-in user (fresh from DB) or null.
     * Re-queries the DB to ensure disabled accounts lose access immediately.
     *
     * @return array<string,mixed>|null
     */
    public static function current_user(): ?array
    {
        if (empty($_SESSION['user_id'])) {
            return null;
        }

        // UA binding check — a mismatch means the cookie is being replayed
        // from a different client. Drop the session.
        if (($_SESSION['ua_hash'] ?? '') !== self::userAgentHash()) {
            self::logout_user();
            return null;
        }

        $stmt = Database::connection()->prepare(
            'SELECT id, email, name, role, created_at, password_changed_at, totp_enabled_at
             FROM users
             WHERE id = :id AND is_active = 1
             LIMIT 1'
        );
        $stmt->execute([':id' => (int) $_SESSION['user_id']]);
        $user = $stmt->fetch();
        if (!is_array($user)) {
            return null;
        }

        // Password changed since this session logged in: sign it out.
        if ((string) ($user['password_changed_at'] ?? '') !== (string) ($_SESSION['pwd_at'] ?? '')) {
            self::logout_user();
            return null;
        }

        unset($user['password_changed_at']);
        return $user;
    }

    /**
     * Enforce authentication on the current request.
     * - API requests get a 401 JSON body.
     * - HTML requests get a 302 redirect to /login.php.
     *
     * @return array<string,mixed>
     */
    public static function require_auth(): array
    {
        $user = self::current_user();
        if ($user !== null) {
            return $user;
        }

        if (self::isApiRequest()) {
            Response::json(['error' => 'Unauthorized'], 401);
        }

        header('Location: /login.php');
        exit;
    }

    /**
     * @param array<string,mixed> $user
     */
    public static function can(array $user, string $module): bool
    {
        $role = (string) ($user['role'] ?? 'user');
        if ($role === 'admin') {
            return true;
        }
        $allowed = $GLOBALS['config']['access'][$module] ?? [];
        return in_array($role, $allowed, true);
    }

    /**
     * Enforce authentication and module access on the current request.
     *
     * @return array<string,mixed>
     */
    public static function require_access(string $module): array
    {
        $user = self::require_auth();

        if (TwoFactor::isRequired($user) && !TwoFactor::isEnabled($user)) {
            if (self::isApiRequest()) {
                Response::json(['error' => 'Two-factor authentication must be set up first.', 'redirect' => '/account.php'], 403);
            }
            header('Location: /account.php?enroll=1');
            exit;
        }

        if (self::can($user, $module)) {
            return $user;
        }

        Audit::log('access.denied', 'module', $module);

        if (self::isApiRequest()) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
        exit;
    }

    private static function userAgentHash(): string
    {
        return hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? '');
    }

    private static function isApiRequest(): bool
    {
        $uri    = (string) ($_SERVER['REQUEST_URI'] ?? '');
        $accept = (string) ($_SERVER['HTTP_ACCEPT'] ?? '');
        return str_starts_with($uri, '/api/') || str_contains($accept, 'application/json');
    }
}
