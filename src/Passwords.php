<?php
/**
 * Password updates. Setting a password bumps password_changed_at, which
 * signs out every other session (Auth::current_user), and cancels any
 * outstanding reset link.
 */
declare(strict_types=1);

namespace App;

final class Passwords
{
    /** Returns the new password_changed_at value. */
    public static function set(int $userId, string $password): string
    {
        $db  = Database::connection();
        $now = date('Y-m-d H:i:s');
        $db->prepare('UPDATE users SET password_hash = :h, password_changed_at = :t WHERE id = :id')
            ->execute([':h' => password_hash($password, PASSWORD_DEFAULT), ':t' => $now, ':id' => $userId]);
        $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = :id AND used_at IS NULL')
            ->execute([':id' => $userId]);
        return $now;
    }
}
