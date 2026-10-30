<?php
/**
 * Per-organization booking settings; the row (and the booking link) is
 * created on first read. Online booking stays closed until the owner opens it.
 */
declare(strict_types=1);

namespace App\Bookora;

use App\Database;

final class Settings
{
    /**
     * @return array<string,mixed>
     */
    public static function get(int $orgId): array
    {
        $pdo = Database::connection();
        $pdo->prepare('INSERT IGNORE INTO bookora_settings (organization_id, public_token) VALUES (:oid, :t)')
            ->execute([':oid' => $orgId, ':t' => bin2hex(random_bytes(16))]);
        $stmt = $pdo->prepare('SELECT * FROM bookora_settings WHERE organization_id = :oid');
        $stmt->execute([':oid' => $orgId]);
        $r = $stmt->fetch();
        $r['booking_open'] = (int) $r['booking_open'] === 1;
        foreach (['intro', 'bank_details', 'juice_number', 'notify_email'] as $text) {
            $r[$text] = (string) ($r[$text] ?? '');
        }
        $r['deposit_percent'] = (int) $r['deposit_percent'];
        $r['hold_hours']      = (int) $r['hold_hours'];
        return $r;
    }

    public static function orgByToken(string $token): ?int
    {
        if (!preg_match('/^[0-9a-f]{32}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT organization_id FROM bookora_settings WHERE public_token = :t');
        $stmt->execute([':t' => $token]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /**
     * @param array<string,mixed> $in booking_open, intro, checkin_time, checkout_time, deposit_percent, hold_hours,
     *                                bank_details, juice_number, notify_email
     */
    public static function save(int $orgId, array $in): ?string
    {
        $t = static fn (string $k): string => trim((string) ($in[$k] ?? ''));
        foreach (['checkin_time', 'checkout_time'] as $k) {
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t($k))) {
                return 'Heure invalide (format 14:00).';
            }
        }
        $deposit = $t('deposit_percent');
        $hold    = $t('hold_hours');
        if (!ctype_digit($deposit) || (int) $deposit > 100) {
            return 'Acompte invalide (0 à 100 %).';
        }
        if (!ctype_digit($hold) || (int) $hold < 12 || (int) $hold > 168) {
            return 'Délai de confirmation invalide (12 à 168 heures).';
        }
        if (mb_strlen($t('intro')) > 500 || mb_strlen($t('bank_details')) > 300 || mb_strlen($t('juice_number')) > 40) {
            return 'Un des textes est trop long.';
        }
        if ((int) $deposit > 0 && $t('bank_details') === '' && $t('juice_number') === '') {
            return 'Pour demander un acompte, indiquez vos coordonnées bancaires ou un numéro Juice.';
        }
        if ($t('notify_email') !== '' && (!filter_var($t('notify_email'), FILTER_VALIDATE_EMAIL) || strlen($t('notify_email')) > 254)) {
            return 'E-mail de notification invalide.';
        }
        self::get($orgId);
        $null = static fn (string $v): ?string => $v !== '' ? $v : null;
        Database::connection()->prepare(
            'UPDATE bookora_settings SET booking_open = :o, intro = :i, checkin_time = :ci, checkout_time = :co, deposit_percent = :d,
                    hold_hours = :h, bank_details = :b, juice_number = :j, notify_email = :n WHERE organization_id = :oid'
        )->execute([
            ':o' => ($in['booking_open'] ?? false) === true ? 1 : 0, ':i' => $null($t('intro')), ':ci' => $t('checkin_time'), ':co' => $t('checkout_time'),
            ':d' => (int) $deposit, ':h' => (int) $hold, ':b' => $null($t('bank_details')), ':j' => $null($t('juice_number')),
            ':n' => $null($t('notify_email')), ':oid' => $orgId,
        ]);
        return null;
    }

    public static function newLink(int $orgId): void
    {
        self::get($orgId);
        Database::connection()->prepare('UPDATE bookora_settings SET public_token = :t WHERE organization_id = :oid')
            ->execute([':t' => bin2hex(random_bytes(16)), ':oid' => $orgId]);
    }
}
