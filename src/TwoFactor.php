<?php
/**
 * Two-factor authentication: TOTP enrolment, verification and recovery codes.
 */
declare(strict_types=1);

namespace App;

use PDO;

final class TwoFactor
{
    private const RECOVERY_CODES = 10;

    /** @param array<string,mixed> $user */
    public static function isRequired(array $user): bool
    {
        $roles = $GLOBALS['config']['security']['require_2fa_roles'] ?? [];
        return in_array((string) ($user['role'] ?? ''), $roles, true);
    }

    /** @param array<string,mixed> $user */
    public static function isEnabled(array $user): bool
    {
        return !empty($user['totp_enabled_at']);
    }

    /**
     * Enable 2FA with a secret the user has just proven they hold.
     * Returns the plaintext recovery codes (shown once).
     *
     * @return list<string>
     */
    public static function enable(int $userId, string $secretB32, int $step): array
    {
        $db = Database::connection();
        $db->beginTransaction();
        try {
            $db->prepare(
                'UPDATE users SET totp_secret = :s, totp_enabled_at = NOW(), totp_last_step = :step WHERE id = :id'
            )->execute([':s' => Crypto::encrypt($secretB32), ':step' => $step, ':id' => $userId]);
            $codes = self::replaceRecoveryCodes($userId);
            $db->commit();
            return $codes;
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    public static function disable(int $userId): void
    {
        $db = Database::connection();
        $db->prepare('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = :id')
            ->execute([':id' => $userId]);
        $db->prepare('DELETE FROM recovery_codes WHERE user_id = :id')->execute([':id' => $userId]);
    }

    /**
     * Check a TOTP code or a recovery code. Returns 'totp', 'recovery' or null.
     * Each TOTP step and each recovery code can be used once.
     */
    public static function verify(int $userId, string $input): ?string
    {
        $db   = Database::connection();
        $stmt = $db->prepare('SELECT totp_secret, totp_last_step FROM users WHERE id = :id AND totp_enabled_at IS NOT NULL');
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        if (!is_array($row) || $row['totp_secret'] === null) {
            return null;
        }

        $input = trim($input);
        if (preg_match('/^\d[\d\s]{5,7}$/', $input)) {
            $last = $row['totp_last_step'] === null ? null : (int) $row['totp_last_step'];
            $step = Totp::match(Crypto::decrypt((string) $row['totp_secret']), $input, $last);
            if ($step === null) {
                return null;
            }
            // Conditional update: a concurrent request with the same code loses.
            $upd = $db->prepare(
                'UPDATE users SET totp_last_step = :step WHERE id = :id AND (totp_last_step IS NULL OR totp_last_step < :step2)'
            );
            $upd->execute([':step' => $step, ':step2' => $step, ':id' => $userId]);
            return $upd->rowCount() === 1 ? 'totp' : null;
        }

        $upd = $db->prepare(
            'UPDATE recovery_codes SET used_at = NOW() WHERE user_id = :id AND code_hash = :h AND used_at IS NULL'
        );
        $upd->execute([':id' => $userId, ':h' => self::hashCode($input)]);
        return $upd->rowCount() === 1 ? 'recovery' : null;
    }

    public static function recoveryCodesLeft(int $userId): int
    {
        $stmt = Database::connection()->prepare('SELECT COUNT(*) FROM recovery_codes WHERE user_id = :id AND used_at IS NULL');
        $stmt->execute([':id' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    /** @return list<string> */
    public static function replaceRecoveryCodes(int $userId): array
    {
        $db = Database::connection();
        $db->prepare('DELETE FROM recovery_codes WHERE user_id = :id')->execute([':id' => $userId]);
        $ins   = $db->prepare('INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (:id, :h, NOW())');
        $codes = [];
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
        while (count($codes) < self::RECOVERY_CODES) {
            $raw = '';
            for ($i = 0; $i < 10; $i++) {
                $raw .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $code = substr($raw, 0, 5) . '-' . substr($raw, 5);
            if (isset($codes[$code])) {
                continue;
            }
            $codes[$code] = true;
            $ins->execute([':id' => $userId, ':h' => self::hashCode($code)]);
        }
        return array_keys($codes);
    }

    private static function hashCode(string $code): string
    {
        return hash('sha256', strtolower(str_replace(['-', ' '], '', trim($code))));
    }
}
