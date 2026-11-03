<?php
/**
 * Single-use, time-limited links for merchant accounts: email verification
 * and password reset. Only sha256(token) is stored.
 */
declare(strict_types=1);

namespace App\Portal;

use App\Database;

final class PortalTokens
{
    /** Create a token; earlier live tokens with the same purpose are cancelled. */
    public static function create(int $userId, string $purpose, int $minutes): string
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $db    = Database::connection();
        $db->prepare('UPDATE portal_tokens SET used_at = NOW() WHERE portal_user_id = :u AND purpose = :p AND used_at IS NULL')
            ->execute([':u' => $userId, ':p' => $purpose]);
        $db->prepare('INSERT INTO portal_tokens (portal_user_id, purpose, token_hash, expires_at) VALUES (:u, :p, :h, :exp)')
            ->execute([':u' => $userId, ':p' => $purpose, ':h' => hash('sha256', $token), ':exp' => date('Y-m-d H:i:s', time() + $minutes * 60)]);
        return $token;
    }

    /** Account id for a live token, without consuming it. */
    public static function peek(string $token, string $purpose): ?int
    {
        if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT portal_user_id FROM portal_tokens WHERE token_hash = :h AND purpose = :p AND used_at IS NULL AND expires_at > NOW()'
        );
        $stmt->execute([':h' => hash('sha256', $token), ':p' => $purpose]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /** Consume a live token and return its account id; null if invalid, expired or used. */
    public static function consume(string $token, string $purpose): ?int
    {
        $userId = self::peek($token, $purpose);
        if ($userId === null) {
            return null;
        }
        // Conditional update: two concurrent uses of the same link cannot both succeed.
        $upd = Database::connection()->prepare('UPDATE portal_tokens SET used_at = NOW() WHERE token_hash = :h AND used_at IS NULL');
        $upd->execute([':h' => hash('sha256', $token)]);
        return $upd->rowCount() === 1 ? $userId : null;
    }

    public static function url(string $page, string $token): string
    {
        return rtrim((string) $GLOBALS['config']['app']['url'], '/') . '/portal/' . $page . '?token=' . $token;
    }
}
