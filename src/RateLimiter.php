<?php
/**
 * Simple DB-backed rate limiter for login attempts.
 *
 * Counts attempts matching the current IP OR email within a sliding window.
 * Not cluster-aware, but good enough for a single-server dashboard and
 * trivial to swap for Redis later.
 */
declare(strict_types=1);

namespace App;

final class RateLimiter
{
    public static function tooManyAttempts(string $ip, string $email, int $max, int $window): bool
    {
        // Compute the window start in PHP to avoid placeholder issues with
        // MariaDB's INTERVAL clause.
        $since = date('Y-m-d H:i:s', time() - $window);

        $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE success = 0
               AND attempted_at >= :since
               AND (ip_address = :ip OR email = :email)'
        );
        $stmt->execute([
            ':since' => $since,
            ':ip'    => $ip,
            ':email' => $email,
        ]);

        return (int) $stmt->fetchColumn() >= $max;
    }

    public static function record(string $ip, string $email, bool $success): void
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO login_attempts (ip_address, email, success, attempted_at)
             VALUES (:ip, :email, :s, NOW())'
        );
        $stmt->execute([
            ':ip'    => $ip,
            ':email' => $email,
            ':s'     => $success ? 1 : 0,
        ]);
    }

    /**
     * Wipe attempts for a given IP/email pair. Called after a successful login.
     */
    public static function clear(string $ip, string $email): void
    {
        $stmt = Database::connection()->prepare(
            'DELETE FROM login_attempts WHERE ip_address = :ip OR email = :email'
        );
        $stmt->execute([':ip' => $ip, ':email' => $email]);
    }
}
