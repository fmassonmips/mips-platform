<?php
/**
 * Single-use, time-limited password reset tokens.
 * Only sha256(token) is stored; the raw token travels in the link.
 */
declare(strict_types=1);

namespace App;

final class PasswordReset
{
    /** Create a token for a user and return the reset URL. */
    public static function create(int $userId, ?int $createdBy): string
    {
        $token   = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $minutes = (int) ($GLOBALS['config']['security']['reset_token_minutes'] ?? 60);

        $db = Database::connection();
        // One live link per user: a new request supersedes older ones.
        $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = :id AND used_at IS NULL')
            ->execute([':id' => $userId]);
        $db->prepare(
            'INSERT INTO password_resets (user_id, token_hash, expires_at, created_by, created_at)
             VALUES (:u, :h, :exp, :by, NOW())'
        )->execute([
            ':u'   => $userId,
            ':h'   => hash('sha256', $token),
            ':exp' => date('Y-m-d H:i:s', time() + $minutes * 60),
            ':by'  => $createdBy,
        ]);

        return rtrim((string) $GLOBALS['config']['app']['url'], '/') . '/reset-password.php?token=' . $token;
    }

    /**
     * Return the user row for a valid, unused, unexpired token.
     *
     * @return array<string,mixed>|null
     */
    public static function find(string $token): ?array
    {
        if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT r.id AS reset_id, u.id, u.email, u.name
             FROM password_resets r JOIN users u ON u.id = r.user_id
             WHERE r.token_hash = :h AND r.used_at IS NULL AND r.expires_at > NOW()'
        );
        $stmt->execute([':h' => hash('sha256', $token)]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Consume a token and set the new password. Returns the user row, or
     * null when the token is invalid, expired or already used.
     *
     * @return array<string,mixed>|null
     */
    public static function consume(string $token, string $newPassword): ?array
    {
        $db = Database::connection();
        $db->beginTransaction();
        try {
            $row = self::find($token);
            if ($row === null) {
                $db->rollBack();
                return null;
            }
            // Mark used first and check the row count: two concurrent
            // submissions of the same link cannot both succeed.
            $mark = $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = :id AND used_at IS NULL');
            $mark->execute([':id' => $row['reset_id']]);
            if ($mark->rowCount() !== 1) {
                $db->rollBack();
                return null;
            }
            Passwords::set((int) $row['id'], $newPassword);
            $db->commit();
            return $row;
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
}
