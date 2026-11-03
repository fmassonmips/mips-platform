<?php
/**
 * Simple DB-backed rate limiter for login attempts.
 *
 * Failed attempts are counted per account key (email, "2fa:email", ...) and,
 * with a much higher threshold, per IP address, within a sliding window:
 *  - 5 failures on one account block that account only, from any address;
 *  - only a flood from one address (password spraying across accounts)
 *    blocks the address, so colleagues behind a shared office IP are not
 *    locked out by one person's typos.
 * Quota events (hit()) are stored as successes and never count as failures.
 * Not cluster-aware, but good enough for a single-server dashboard and
 * trivial to swap for Redis later.
 */
declare(strict_types=1);

namespace App;

final class RateLimiter
{
    /**
     * True when the account key has $max failures in the window, or the IP
     * address has rate_limit.max_attempts_per_ip failures (all keys together).
     */
    public static function tooManyAttempts(string $ip, string $email, int $max, int $window): bool
    {
        // Compute the window start in PHP to avoid placeholder issues with
        // MariaDB's INTERVAL clause.
        $since = date('Y-m-d H:i:s', time() - $window);
        $perIp = (int) ($GLOBALS['config']['rate_limit']['max_attempts_per_ip'] ?? 50);

        $stmt = Database::connection()->prepare(
            'SELECT COALESCE(SUM(email = :email1), 0) AS by_key, COALESCE(SUM(ip_address = :ip1), 0) AS by_ip
             FROM login_attempts
             WHERE success = 0
               AND attempted_at >= :since
               AND (ip_address = :ip2 OR email = :email2)'
        );
        $stmt->execute([
            ':since'  => $since,
            ':ip1'    => $ip,
            ':ip2'    => $ip,
            ':email1' => $email,
            ':email2' => $email,
        ]);
        $n = $stmt->fetch();

        return (int) $n['by_key'] >= $max || (int) $n['by_ip'] >= max($max, $perIp);
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
     * Count every event (success or not) recorded under a key within the
     * window. Used for quotas such as portal registrations per IP.
     */
    public static function countKey(string $key, int $window): int
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) FROM login_attempts WHERE email = :k AND attempted_at >= :since'
        );
        $stmt->execute([':k' => $key, ':since' => date('Y-m-d H:i:s', time() - $window)]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Record a quota event under a key. Stored as a success so that it never
     * counts towards the failed-login limit of the same IP address.
     */
    public static function hit(string $ip, string $key): void
    {
        self::record($ip, $key, true);
    }

    /** Wipe attempts recorded under one exact key, e.g. "2fa:user@example.com". */
    public static function clearKey(string $key): void
    {
        Database::connection()->prepare('DELETE FROM login_attempts WHERE email = :k')->execute([':k' => $key]);
    }
}
