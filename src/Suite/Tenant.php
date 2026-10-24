<?php
/**
 * Tenant (organization) resolution.
 *
 * Every suite request runs in the context of one organization. A user who
 * has none yet (accounts created before the suite existed, or freshly
 * activated ones) gets a personal organization on first access, as owner.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;

final class Tenant
{
    /**
     * Return the user's organization with their role in it.
     *
     * @param array<string,mixed> $user
     * @return array{id:int,name:string,role:string}
     */
    public static function forUser(array $user): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT o.id, o.name, ou.role
             FROM organization_users ou
             JOIN organizations o ON o.id = ou.organization_id
             WHERE ou.user_id = :uid
             ORDER BY ou.created_at ASC
             LIMIT 1'
        );
        $stmt->execute([':uid' => (int) $user['id']]);
        $row = $stmt->fetch();

        if (is_array($row)) {
            return ['id' => (int) $row['id'], 'name' => (string) $row['name'], 'role' => (string) $row['role']];
        }

        return self::createFor($user);
    }

    /** Company profile fields printed on documents. */
    public const PROFILE_FIELDS = [
        'legal_name' => 200, 'address' => 500, 'brn' => 40,
        'vat_number' => 40,  'email'   => 254, 'phone' => 40,
    ];

    /**
     * @return array<string,string>
     */
    public static function profile(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT name, legal_name, address, brn, vat_number, email, phone
             FROM organizations WHERE id = :id'
        );
        $stmt->execute([':id' => $orgId]);
        $row = $stmt->fetch() ?: [];

        $profile = ['name' => (string) ($row['name'] ?? '')];
        foreach (array_keys(self::PROFILE_FIELDS) as $field) {
            $profile[$field] = (string) ($row[$field] ?? '');
        }
        return $profile;
    }

    /**
     * @param array<string,string> $profile name + PROFILE_FIELDS, already validated
     */
    public static function updateProfile(int $orgId, array $profile): void
    {
        $sets   = ['name = :name'];
        $params = [':id' => $orgId, ':name' => $profile['name']];
        foreach (array_keys(self::PROFILE_FIELDS) as $field) {
            $sets[]            = $field . ' = :' . $field;
            $params[':' . $field] = ($profile[$field] ?? '') !== '' ? $profile[$field] : null;
        }
        Database::connection()
            ->prepare('UPDATE organizations SET ' . implode(', ', $sets) . ' WHERE id = :id')
            ->execute($params);
    }

    /**
     * @param array{role:string} $org
     */
    public static function canManage(array $org): bool
    {
        return in_array($org['role'], ['owner', 'admin'], true);
    }

    /**
     * @param array<string,mixed> $user
     * @return array{id:int,name:string,role:string}
     */
    private static function createFor(array $user): array
    {
        $pdo  = Database::connection();
        $name = (string) ($user['name'] ?? '') !== '' ? (string) $user['name'] : (string) $user['email'];

        $pdo->beginTransaction();
        try {
            $pdo->prepare('INSERT INTO organizations (name) VALUES (:name)')
                ->execute([':name' => $name]);
            $orgId = (int) $pdo->lastInsertId();

            $pdo->prepare(
                'INSERT INTO organization_users (organization_id, user_id, role) VALUES (:oid, :uid, :role)'
            )->execute([':oid' => $orgId, ':uid' => (int) $user['id'], ':role' => 'owner']);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return ['id' => $orgId, 'name' => $name, 'role' => 'owner'];
    }
}
