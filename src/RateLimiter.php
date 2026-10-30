<?php
/**
 * Simple DB-backed rate limiter for login attempts.
 *
 * Two counters within a sliding window: failures from an IP (all addresses,
 * a looser limit so an office behind one IP keeps working) and failures on
 * an address (all IPs). When an address is over its limit, only an IP that
 * already logged in to it recently may still try: a stranger cannot lock a
 * user out by typing their e-mail, and a botnet cannot keep guessing.
 * A login only clears the failures of its own address.
 * Not cluster-aware, but good enough for a single server.
 */
declare(strict_types=1);

namespace App;

final class RateLimiter
{
    private const IP_FACTOR  = 4;          // failures allowed per IP = max × 4
    private const KNOWN_DAYS = 90;
    private const MAILS_PER_RECIPIENT = 5;     // public-form e-mails to one address per 24 h
    private const MAILS_PER_COMPANY   = 200;   // public-form e-mails from one company per 24 h         // an IP that logged in to an address within 90 days is "known"

    public static function tooManyAttempts(string $ip, string $email, int $max, int $window): bool
    {
        // Compute the window start in PHP to avoid placeholder issues with
        // MariaDB's INTERVAL clause.
        $since = date('Y-m-d H:i:s', time() - $window);
        $pdo   = Database::connection();

        $byIp = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE success = 0 AND attempted_at >= :since AND ip_address = :ip');
        $byIp->execute([':since' => $since, ':ip' => $ip]);
        if ((int) $byIp->fetchColumn() >= $max * self::IP_FACTOR) {
            return true;
        }

        $byEmail = $pdo->prepare(
            'SELECT COUNT(*) AS total, COALESCE(SUM(ip_address = :ip), 0) AS mine
             FROM login_attempts WHERE success = 0 AND attempted_at >= :since AND email = :email'
        );
        $byEmail->execute([':ip' => $ip, ':since' => $since, ':email' => $email]);
        $row = $byEmail->fetch();
        if ((int) $row['total'] < $max) {
            return false;
        }
        // Address under attack: a known IP keeps its own quota, any other IP waits.
        return (int) $row['mine'] >= $max || !self::knownIp($ip, $email);
    }

    private static function knownIp(string $ip, string $email): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT 1 FROM login_attempts WHERE success = 1 AND ip_address = :ip AND email = :email AND attempted_at >= :since LIMIT 1'
        );
        $stmt->execute([':ip' => $ip, ':email' => $email, ':since' => date('Y-m-d H:i:s', time() - self::KNOWN_DAYS * 86400)]);
        return $stmt->fetchColumn() !== false;
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
        if (random_int(1, 100) === 1) {   // prune now and then
            Database::connection()->prepare('DELETE FROM login_attempts WHERE attempted_at < :old')
                ->execute([':old' => date('Y-m-d H:i:s', time() - self::KNOWN_DAYS * 86400)]);
        }
    }

    /**
     * Requests of one kind (sign-up, password reset…) from an IP within a window.
     * Stored as successful rows under a "#kind" marker, so they never count as
     * failed logins (an office behind one IP must still be able to log in).
     */
    public static function tooManyRequests(string $ip, string $kind, int $max, int $window): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) FROM login_attempts WHERE ip_address = :ip AND email = :k AND success = 1 AND attempted_at >= :since'
        );
        $stmt->execute([':ip' => $ip, ':k' => '#' . $kind, ':since' => date('Y-m-d H:i:s', time() - $window)]);
        return (int) $stmt->fetchColumn() >= $max;
    }

    public static function recordRequest(string $ip, string $kind): void
    {
        self::record($ip, '#' . $kind, true);
    }

    /**
     * E-mails that a public form (booking, order, ticket) sends to the address
     * the visitor typed. Capped per recipient across all companies and per
     * company, so the forms cannot be used to mail strangers in bulk.
     * Records the mail when allowed.
     */
    public static function allowPublicMail(int $orgId, ?string $to): bool
    {
        if ($to === null || $to === '' || !Mail\SmtpMailer::isConfigured()) {
            return true;   // no e-mail goes out: nothing to cap
        }
        $since = date('Y-m-d H:i:s', time() - 86400);
        $pdo   = Database::connection();
        $key   = '#mail:' . hash('sha256', mb_strtolower(trim($to)));   // fits the column, no address stored
        $byTo  = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE email = :k AND attempted_at >= :since');
        $byTo->execute([':k' => $key, ':since' => $since]);
        $byOrg = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip_address = :o AND email LIKE \'#mail:%\' AND attempted_at >= :since');
        $byOrg->execute([':o' => 'org:' . $orgId, ':since' => $since]);
        if ((int) $byTo->fetchColumn() >= self::MAILS_PER_RECIPIENT || (int) $byOrg->fetchColumn() >= self::MAILS_PER_COMPANY) {
            error_log('[RateLimiter] public mail cap reached for company ' . $orgId);
            return false;
        }
        self::record('org:' . $orgId, $key, true);
        return true;
    }

    /**
     * After a successful login (or a password reset): forget the failures on
     * this address only. Failures from the IP on other addresses still count,
     * so logging in to one's own account does not reset a guessing run.
     */
    public static function clear(string $email): void
    {
        Database::connection()->prepare('DELETE FROM login_attempts WHERE email = :email AND success = 0')
            ->execute([':email' => $email]);
    }
}
