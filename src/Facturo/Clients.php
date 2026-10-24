<?php
/**
 * Facturo clients, always scoped to one organization.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;

final class Clients
{
    /** Editable fields and their max length. */
    public const FIELDS = [
        'name' => 200, 'email' => 254, 'phone' => 40,
        'address' => 500, 'brn' => 40, 'vat_number' => 40,
    ];

    /**
     * @return list<array<string,mixed>>
     */
    public static function all(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, email, phone, address, brn, vat_number
             FROM facturo_clients WHERE organization_id = :oid ORDER BY name'
        );
        $stmt->execute([':oid' => $orgId]);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, email, phone, address, brn, vat_number
             FROM facturo_clients WHERE organization_id = :oid AND id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Validate raw input. Returns [clean fields, error|null].
     *
     * @param array<string,string> $input
     * @return array{0:array<string,?string>,1:?string}
     */
    public static function validate(array $input): array
    {
        $clean = [];
        foreach (self::FIELDS as $field => $max) {
            $value = trim($input[$field] ?? '');
            if (mb_strlen($value) > $max) {
                return [[], ucfirst(str_replace('_', ' ', $field)) . ' is too long.'];
            }
            $clean[$field] = $value !== '' ? $value : null;
        }
        if ($clean['name'] === null) {
            return [[], 'Client name is required.'];
        }
        if ($clean['email'] !== null && !filter_var($clean['email'], FILTER_VALIDATE_EMAIL)) {
            return [[], 'Client email is invalid.'];
        }
        return [$clean, null];
    }

    /**
     * Insert (id = 0) or update. Returns the client id, or null when the
     * id does not belong to the organization.
     *
     * @param array<string,?string> $fields validated by validate()
     */
    public static function save(int $orgId, int $id, array $fields): ?int
    {
        $pdo    = Database::connection();
        $params = [':oid' => $orgId];
        foreach (array_keys(self::FIELDS) as $field) {
            $params[':' . $field] = $fields[$field];
        }

        if ($id === 0) {
            $pdo->prepare(
                'INSERT INTO facturo_clients (organization_id, name, email, phone, address, brn, vat_number)
                 VALUES (:oid, :name, :email, :phone, :address, :brn, :vat_number)'
            )->execute($params);
            return (int) $pdo->lastInsertId();
        }

        if (self::find($orgId, $id) === null) {
            return null;
        }
        $params[':id'] = $id;
        $pdo->prepare(
            'UPDATE facturo_clients
             SET name = :name, email = :email, phone = :phone, address = :address,
                 brn = :brn, vat_number = :vat_number
             WHERE organization_id = :oid AND id = :id'
        )->execute($params);
        return $id;
    }

    /**
     * Delete a client that has no documents. Returns an error message or null.
     */
    public static function delete(int $orgId, int $id): ?string
    {
        if (self::find($orgId, $id) === null) {
            return 'Client not found.';
        }
        $pdo  = Database::connection();
        $used = $pdo->prepare('SELECT 1 FROM facturo_documents WHERE organization_id = :oid AND client_id = :id LIMIT 1');
        $used->execute([':oid' => $orgId, ':id' => $id]);
        if ($used->fetch()) {
            return 'This client has quotes or invoices and cannot be deleted.';
        }
        $pdo->prepare('DELETE FROM facturo_clients WHERE organization_id = :oid AND id = :id')
            ->execute([':oid' => $orgId, ':id' => $id]);
        return null;
    }
}
