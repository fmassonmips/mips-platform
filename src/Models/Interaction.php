<?php
/**
 * Client interaction (history) data access.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;

final class Interaction
{
    public const TYPES = ['note', 'call', 'email', 'meeting'];

    /**
     * @return array<int,array<string,mixed>>
     */
    public static function forClient(int $clientId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT i.*, u.name AS user_name
               FROM client_interactions i
               LEFT JOIN users u ON u.id = i.user_id
              WHERE i.client_id = :cid
              ORDER BY i.occurred_at DESC, i.id DESC
              LIMIT 500'
        );
        $stmt->execute([':cid' => $clientId]);
        return $stmt->fetchAll();
    }

    /**
     * @param array<string,mixed> $d
     */
    public static function create(int $clientId, array $d, ?int $userId): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO client_interactions (client_id, user_id, type, summary, details, occurred_at, created_at)
             VALUES (:cid, :uid, :type, :summary, :details, :occurred, NOW())'
        );
        $stmt->execute([
            ':cid'      => $clientId,
            ':uid'      => $userId,
            ':type'     => $d['type'],
            ':summary'  => $d['summary'],
            ':details'  => $d['details'],
            ':occurred' => $d['occurred_at'],
        ]);
        return (int) Database::connection()->lastInsertId();
    }

    public static function delete(int $id): void
    {
        $stmt = Database::connection()->prepare('DELETE FROM client_interactions WHERE id = :id');
        $stmt->execute([':id' => $id]);
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM client_interactions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }
}
