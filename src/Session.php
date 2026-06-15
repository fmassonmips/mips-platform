<?php
/**
 * Secure session management.
 *
 * - Strict mode (prevents uninitialised session IDs)
 * - HttpOnly cookie (no JavaScript access)
 * - Secure cookie (HTTPS only)
 * - SameSite=Lax (blocks most CSRF vectors)
 * - Idle timeout with automatic destruction
 */
declare(strict_types=1);

namespace App;

final class Session
{
    /**
     * @param array<string,mixed> $cfg
     */
    public static function start(array $cfg): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        // Harden session runtime settings.
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.use_trans_sid', '0');
        // sid_length / sid_bits_per_character were deprecated in PHP 8.4 (the
        // engine now uses secure defaults). Only set them on older versions to
        // avoid emitting E_DEPRECATED into responses.
        if (PHP_VERSION_ID < 80400) {
            ini_set('session.sid_length', '64');
            ini_set('session.sid_bits_per_character', '6');
        }

        session_name((string) $cfg['name']);
        session_set_cookie_params([
            'lifetime' => (int)    $cfg['lifetime'],
            'path'     => (string) $cfg['path'],
            'domain'   => (string) $cfg['domain'],
            'secure'   => (bool)   $cfg['secure'],
            'httponly' => (bool)   $cfg['httponly'],
            'samesite' => (string) $cfg['samesite'],
        ]);

        session_start();

        // Enforce idle timeout.
        $idle = (int) ($cfg['idle_timeout'] ?? 0);
        if ($idle > 0 && isset($_SESSION['last_activity'])) {
            if (time() - (int) $_SESSION['last_activity'] > $idle) {
                self::destroy();
                session_start();
            }
        }
        $_SESSION['last_activity'] = time();
    }

    /**
     * Regenerate the session ID while keeping session data.
     * Must be called right after a privilege change (e.g. successful login).
     */
    public static function regenerate(): void
    {
        session_regenerate_id(true);
    }

    /**
     * Wipe session data, delete the cookie, destroy the session.
     */
    public static function destroy(): void
    {
        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                [
                    'expires'  => time() - 42000,
                    'path'     => $params['path'],
                    'domain'   => $params['domain'],
                    'secure'   => $params['secure'],
                    'httponly' => $params['httponly'],
                    'samesite' => $params['samesite'],
                ]
            );
        }

        session_destroy();
    }
}
