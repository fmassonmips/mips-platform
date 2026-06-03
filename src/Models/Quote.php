<?php
/**
 * Quote request (devis) data access.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;

final class Quote
{
    public const STATUSES = ['new', 'in_progress', 'converted', 'declined'];

    /**
     * @return array<int,array<string,mixed>>
     */
    public static function all(?string $search = null, ?int $clientId = null, ?string $status = null): array
    {
        $sql = 'SELECT q.*, c.name AS client_name
                  FROM quotes q
                  JOIN clients c ON c.id = q.client_id';
        $where  = [];
        $params = [];

        if ($clientId !== null) {
            $where[] = 'q.client_id = :cid';
            $params[':cid'] = $clientId;
        }
        if ($status !== null && in_array($status, self::STATUSES, true)) {
            $where[] = 'q.status = :status';
            $params[':status'] = $status;
        }
        if ($search !== null && $search !== '') {
            $where[] = '(q.reference LIKE :q OR q.type LIKE :q OR c.name LIKE :q)';
            $params[':q'] = '%' . $search . '%';
        }
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY q.created_at DESC LIMIT 1000';

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
            'SELECT q.*, c.name AS client_name
               FROM quotes q
               JOIN clients c ON c.id = q.client_id
              WHERE q.id = :id LIMIT 1'
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
            'INSERT INTO quotes
                (client_id, reference, type, details, estimated_premium, status, created_by, created_at, updated_at)
             VALUES
                (:client_id, :reference, :type, :details, :estimated_premium, :status, :uid, NOW(), NOW())'
        );
        $stmt->execute([
            ':client_id'         => $d['client_id'],
            ':reference'         => $d['reference'],
            ':type'              => $d['type'],
            ':details'           => $d['details'],
            ':estimated_premium' => $d['estimated_premium'],
            ':status'            => $d['status'],
            ':uid'               => $userId,
        ]);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * @param array<string,mixed> $d
     */
    public static function update(int $id, array $d): void
    {
        $stmt = Database::connection()->prepare(
            'UPDATE quotes SET
                client_id = :client_id, reference = :reference, type = :type, details = :details,
                estimated_premium = :estimated_premium, status = :status
             WHERE id = :id'
        );
        $stmt->execute([
            ':client_id'         => $d['client_id'],
            ':reference'         => $d['reference'],
            ':type'              => $d['type'],
            ':details'           => $d['details'],
            ':estimated_premium' => $d['estimated_premium'],
            ':status'            => $d['status'],
            ':id'                => $id,
        ]);
    }

    /**
     * Mark a quote as converted and link it to the contract it produced.
     */
    public static function markConverted(int $id, int $contractId): void
    {
        $stmt = Database::connection()->prepare(
            "UPDATE quotes SET status = 'converted', contract_id = :ctid WHERE id = :id"
        );
        $stmt->execute([':ctid' => $contractId, ':id' => $id]);
    }

    public static function delete(int $id): void
    {
        $stmt = Database::connection()->prepare('DELETE FROM quotes WHERE id = :id');
        $stmt->execute([':id' => $id]);
    }

    /**
     * Generate the next reference of the form Q-YYYY-NNNN for the current year.
     */
    public static function nextReference(): string
    {
        $year = date('Y');
        $stmt = Database::connection()->prepare(
            "SELECT reference FROM quotes WHERE reference LIKE :pfx ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([':pfx' => 'Q-' . $year . '-%']);
        $last = $stmt->fetchColumn();

        $seq = 1;
        if (is_string($last) && preg_match('/-(\d+)$/', $last, $m) === 1) {
            $seq = (int) $m[1] + 1;
        }
        return sprintf('Q-%s-%04d', $year, $seq);
    }
}
