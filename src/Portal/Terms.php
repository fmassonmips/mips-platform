<?php
/**
 * Versioned terms of use for the merchant portal, and the consent log.
 * The current version is the latest published one. Published versions are
 * never edited; each acceptance stores the sha256 of the exact text shown.
 */
declare(strict_types=1);

namespace App\Portal;

use App\Database;
use RuntimeException;

final class Terms
{
    /** @return array<string,mixed>|null */
    public static function current(): ?array
    {
        $row = Database::connection()->query('SELECT * FROM terms_versions ORDER BY id DESC LIMIT 1')->fetch();
        return is_array($row) ? $row : null;
    }

    public static function hasAccepted(int $userId, int $versionId): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM terms_acceptances WHERE portal_user_id = :u AND terms_version_id = :v');
        $stmt->execute([':u' => $userId, ':v' => $versionId]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * Record the acceptance of a version. $shownSha256 is the hash of the
     * text the browser displayed: it must match, so that a merchant never
     * accepts a version that changed under them.
     */
    public static function accept(int $userId, int $versionId, string $shownSha256, string $ip, string $userAgent): void
    {
        $current = self::current();
        if ($current === null || (int) $current['id'] !== $versionId || !hash_equals((string) $current['body_sha256'], $shownSha256)) {
            throw new RuntimeException('The terms of use have changed. Please read the current version.', 409);
        }
        Database::connection()->prepare(
            'INSERT IGNORE INTO terms_acceptances (portal_user_id, terms_version_id, body_sha256, ip_address, user_agent)
             VALUES (:u, :v, :h, :ip, :ua)'
        )->execute([':u' => $userId, ':v' => $versionId, ':h' => $current['body_sha256'], ':ip' => $ip, ':ua' => mb_substr($userAgent, 0, 255)]);
    }

    /** @return array<string,mixed> the new version */
    public static function publish(string $version, string $title, string $body, int $staffId): array
    {
        $version = trim($version);
        $title   = trim($title);
        $body    = str_replace("\r\n", "\n", trim($body));
        if (!preg_match('/^[A-Za-z0-9._-]{1,20}$/', $version)) {
            throw new RuntimeException('Version: 1 to 20 letters, digits, dots or dashes (e.g. 2026.1).', 422);
        }
        if ($title === '' || mb_strlen($title) > 200) {
            throw new RuntimeException('A title is required (max 200 characters).', 422);
        }
        if (mb_strlen($body) < 50) {
            throw new RuntimeException('The text of the terms is required.', 422);
        }
        $db  = Database::connection();
        $dup = $db->prepare('SELECT 1 FROM terms_versions WHERE version = :v');
        $dup->execute([':v' => $version]);
        if ($dup->fetchColumn() !== false) {
            throw new RuntimeException('This version number already exists. Published versions cannot be changed.', 409);
        }
        $db->prepare('INSERT INTO terms_versions (version, title, body, body_sha256, published_by) VALUES (:v, :t, :b, :h, :u)')
            ->execute([':v' => $version, ':t' => $title, ':b' => $body, ':h' => hash('sha256', $body), ':u' => $staffId]);
        return self::current() ?? [];
    }
}
