<?php
/**
 * Per-organization FlowDesk settings; the row (and the support form link)
 * is created on first read.
 */
declare(strict_types=1);

namespace App\FlowDesk;

use App\Database;

final class Settings
{
    /**
     * @return array{public_token:string,form_enabled:bool,notify_email:string,intro:string}
     */
    public static function get(int $orgId): array
    {
        $pdo = Database::connection();
        $pdo->prepare('INSERT IGNORE INTO flowdesk_settings (organization_id, public_token) VALUES (:oid, :t)')
            ->execute([':oid' => $orgId, ':t' => bin2hex(random_bytes(16))]);
        $stmt = $pdo->prepare('SELECT * FROM flowdesk_settings WHERE organization_id = :oid');
        $stmt->execute([':oid' => $orgId]);
        $row = $stmt->fetch();
        return [
            'public_token' => (string) $row['public_token'],
            'form_enabled' => (int) $row['form_enabled'] === 1,
            'notify_email' => (string) ($row['notify_email'] ?? ''),
            'intro'        => (string) ($row['intro'] ?? ''),
        ];
    }

    public static function orgByToken(string $token): ?int
    {
        if (!preg_match('/^[0-9a-f]{32}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT organization_id FROM flowdesk_settings WHERE public_token = :t');
        $stmt->execute([':t' => $token]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    public static function save(int $orgId, bool $enabled, string $email, string $intro): ?string
    {
        $email = trim($email);
        $intro = trim($intro);
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return 'E-mail de notification invalide.';
        }
        if (mb_strlen($intro) > 500) {
            return 'Le message d\'accueil est trop long (500 caractères max.).';
        }
        self::get($orgId);
        Database::connection()->prepare(
            'UPDATE flowdesk_settings SET form_enabled = :en, notify_email = :e, intro = :i WHERE organization_id = :oid'
        )->execute([':en' => $enabled ? 1 : 0, ':e' => $email !== '' ? $email : null, ':i' => $intro !== '' ? $intro : null, ':oid' => $orgId]);
        return null;
    }

    public static function newLink(int $orgId): void
    {
        self::get($orgId);
        Database::connection()->prepare('UPDATE flowdesk_settings SET public_token = :t WHERE organization_id = :oid')
            ->execute([':t' => bin2hex(random_bytes(16)), ':oid' => $orgId]);
    }
}
