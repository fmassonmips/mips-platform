<?php
/**
 * Contract / policy data access.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;

final class Contract
{
    public const TYPES    = ['auto', 'home', 'health', 'life', 'travel', 'business', 'other'];
    public const STATUSES = ['active', 'pending', 'expired', 'cancelled', 'renewed'];

    /**
     * List policies (joined to client name), optionally filtered by client,
     * status and/or free-text search.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function all(?string $search = null, ?int $clientId = null, ?string $status = null): array
    {
        $sql = 'SELECT ct.*, c.name AS client_name
                  FROM contracts ct
                  JOIN clients c ON c.id = ct.client_id';
        $where  = [];
        $params = [];

        if ($clientId !== null) {
            $where[] = 'ct.client_id = :cid';
            $params[':cid'] = $clientId;
        }
        if ($status !== null && in_array($status, self::STATUSES, true)) {
            $where[] = 'ct.status = :status';
            $params[':status'] = $status;
        }
        if ($search !== null && $search !== '') {
            $where[] = '(ct.policy_number LIKE :q OR ct.insurer LIKE :q OR c.name LIKE :q)';
            $params[':q'] = '%' . $search . '%';
        }
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY ct.end_date ASC LIMIT 1000';

        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT ct.*, c.name AS client_name
               FROM contracts ct
               JOIN clients c ON c.id = ct.client_id
              WHERE ct.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<string,mixed> $d
     */
    public static function create(array $d, ?int $userId): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO contracts
                (client_id, policy_number, insurer, type, premium, commission_rate,
                 start_date, end_date, status, notes, created_by, created_at, updated_at)
             VALUES
                (:client_id, :policy_number, :insurer, :type, :premium, :commission_rate,
                 :start_date, :end_date, :status, :notes, :uid, NOW(), NOW())'
        );
        $stmt->execute(self::bind($d) + [':uid' => $userId]);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * @param array<string,mixed> $d
     */
    public static function update(int $id, array $d): void
    {
        $stmt = Database::connection()->prepare(
            'UPDATE contracts SET
                client_id = :client_id, policy_number = :policy_number, insurer = :insurer,
                type = :type, premium = :premium, commission_rate = :commission_rate,
                start_date = :start_date, end_date = :end_date, status = :status, notes = :notes
             WHERE id = :id'
        );
        $stmt->execute(self::bind($d) + [':id' => $id]);
    }

    public static function delete(int $id): void
    {
        $stmt = Database::connection()->prepare('DELETE FROM contracts WHERE id = :id');
        $stmt->execute([':id' => $id]);
    }

    /**
     * @param array<string,mixed> $d
     * @return array<string,mixed>
     */
    private static function bind(array $d): array
    {
        return [
            ':client_id'       => $d['client_id'],
            ':policy_number'   => $d['policy_number'],
            ':insurer'         => $d['insurer'],
            ':type'            => $d['type'],
            ':premium'         => $d['premium'],
            ':commission_rate' => $d['commission_rate'],
            ':start_date'      => $d['start_date'],
            ':end_date'        => $d['end_date'],
            ':status'          => $d['status'],
            ':notes'           => $d['notes'],
        ];
    }
}
