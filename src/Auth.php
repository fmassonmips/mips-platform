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
            'SELECT id, email, password_hash, name, role, is_active
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

        $_SESSION['user_id']       = (int) $user['id'];
        $_SESSION['user_email']    = (string) $user['email'];
        $_SESSION['logged_in_at']  = time();
        $_SESSION['last_activity'] = time();
        // Bind to a hash of the User-Agent to make stolen-cookie replay harder.
        $_SESSION['ua_hash']       = self::userAgentHash();
        unset($_SESSION['csrf_token']);   // new token on the next page load
        Database::connection()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute([':id' => (int) $user['id']]);
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

        // Absolute lifetime: log in again after N hours, however active.
        $max = (int) ($GLOBALS['config']['session']['max_lifetime'] ?? 0);
        if ($max > 0 && time() - (int) ($_SESSION['logged_in_at'] ?? 0) > $max) {
            self::logout_user();
            return null;
        }

        $stmt = Database::connection()->prepare(
            'SELECT id, email, name, role, created_at, password_changed_at, terms_version
             FROM users
             WHERE id = :id AND is_active = 1
               AND NOT EXISTS (SELECT 1 FROM organization_users ou JOIN organizations o ON o.id = ou.organization_id
                               WHERE ou.user_id = users.id
                                 AND (o.suspended_at IS NOT NULL OR (o.deletion_scheduled_at IS NOT NULL AND ou.role <> \'owner\')))   -- suspended by MIPS, or closing (owner only)
             LIMIT 1'
        );
        $stmt->execute([':id' => (int) $_SESSION['user_id']]);
        $user = $stmt->fetch();

        // A password change (reset link) ends the sessions opened before it.
        if (is_array($user) && $user['password_changed_at'] !== null
            && strtotime((string) $user['password_changed_at']) > (int) ($_SESSION['logged_in_at'] ?? 0)) {
            self::logout_user();
            return null;
        }
        if (is_array($user)) {
            unset($user['password_changed_at']);
        }

        return is_array($user) ? $user : null;
    }

    /**
     * Why the user's company is closed to them (suspended by MIPS, or being closed by its
     * owner: only the owner still gets in), or null when it is not.
     */
    public static function suspension(int $userId): ?string
    {
        $stmt = Database::connection()->prepare(
            'SELECT IF(o.suspended_at IS NOT NULL, COALESCE(o.suspended_reason, \'\'), \'fermeture du compte demandée par le propriétaire\')
             FROM organization_users ou JOIN organizations o ON o.id = ou.organization_id
             WHERE ou.user_id = :u AND (o.suspended_at IS NOT NULL OR (o.deletion_scheduled_at IS NOT NULL AND ou.role <> \'owner\')) LIMIT 1'
        );
        $stmt->execute([':u' => $userId]);
        $reason = $stmt->fetchColumn();
        return $reason === false ? null : (string) $reason;
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
            Response::json(['error' => 'Non autorisé'], 401);
        }

        header('Location: /login.php');
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
