<?php
/**
 * Per-organization MRA e-invoicing settings. Each taxpayer registers its own
 * EBS on the MRA portal: MRA rejects invoices whose seller TAN differs from
 * the TAN of the registered user, so credentials cannot be shared.
 */
declare(strict_types=1);

namespace App\Mra;

use App\Database;
use App\Secrets;

final class Settings
{
    /**
     * @return array{enabled:bool,username:string,ebs_id:string,has_password:bool}
     */
    public static function get(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT mra_enabled, mra_username, mra_password_enc, mra_ebs_id FROM organizations WHERE id = :id'
        );
        $stmt->execute([':id' => $orgId]);
        $row = $stmt->fetch() ?: [];
        return [
            'enabled'      => (int) ($row['mra_enabled'] ?? 0) === 1,
            'username'     => (string) ($row['mra_username'] ?? ''),
            'ebs_id'       => (string) ($row['mra_ebs_id'] ?? ''),
            'has_password' => ($row['mra_password_enc'] ?? null) !== null,
        ];
    }

    public static function isEnabled(int $orgId): bool
    {
        return self::get($orgId)['enabled'];
    }

    /**
     * Save settings. An empty password keeps the stored one. Returns an error or null.
     */
    public static function save(int $orgId, bool $enabled, string $username, string $password, string $ebsId): ?string
    {
        if (mb_strlen($username) > 100 || mb_strlen($ebsId) > 50 || strlen($password) > 200) {
            return 'One of the MRA fields is too long.';
        }
        $current = self::get($orgId);
        if ($enabled && ($username === '' || $ebsId === '' || ($password === '' && !$current['has_password']))) {
            return 'Username, password and EBS MRA ID are required to enable e-invoicing.';
        }
        if ($password !== '' && !Secrets::isConfigured()) {
            return 'Server secret key is not configured; MRA passwords cannot be stored.';
        }

        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE organizations SET mra_enabled = :en, mra_username = :u, mra_ebs_id = :ebs WHERE id = :id'
        )->execute([
            ':en'  => $enabled ? 1 : 0,
            ':u'   => $username !== '' ? $username : null,
            ':ebs' => $ebsId !== '' ? $ebsId : null,
            ':id'  => $orgId,
        ]);
        if ($password !== '') {
            $pdo->prepare('UPDATE organizations SET mra_password_enc = :p WHERE id = :id')
                ->execute([':p' => Secrets::encrypt($password), ':id' => $orgId]);
        }
        // New credentials invalidate any cached token.
        $pdo->prepare('DELETE FROM mra_tokens WHERE organization_id = :id')->execute([':id' => $orgId]);
        return null;
    }

    /**
     * @return array{username:string,password:string,ebs_id:string}
     */
    public static function credentials(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT mra_username, mra_password_enc, mra_ebs_id FROM organizations WHERE id = :id'
        );
        $stmt->execute([':id' => $orgId]);
        $row = $stmt->fetch() ?: [];
        if (empty($row['mra_username']) || empty($row['mra_password_enc']) || empty($row['mra_ebs_id'])) {
            throw new MraException('MRA credentials are incomplete.', false);
        }
        return [
            'username' => (string) $row['mra_username'],
            'password' => Secrets::decrypt((string) $row['mra_password_enc']),
            'ebs_id'   => (string) $row['mra_ebs_id'],
        ];
    }
}
