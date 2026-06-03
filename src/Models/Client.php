<?php
/**
 * Client (CRM) data access.
 * Plain prepared-statement queries — no ORM, matching the rest of the app.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;

final class Client
{
    public const TYPES = ['individual', 'company'];

    /**
     * List clients, optionally filtered by a free-text search, with a count
     * of linked policies for the list view.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function all(?string $search = null): array
    {
        $sql = 'SELECT c.*,
                       (SELECT COUNT(*) FROM contracts ct WHERE ct.client_id = c.id) AS contracts_count
                FROM clients c';
        $params = [];

        if ($search !== null && $search !== '') {
            $sql .= ' WHERE c.name LIKE :q OR c.email LIKE :q OR c.phone LIKE :q';
            $params[':q'] = '%' . $search . '%';
        }
        $sql .= ' ORDER BY c.name ASC LIMIT 500';

        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM clients WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Lightweight id => name list for dropdowns.
     *
     * @return array<int,array{id:int,name:string}>
     */
    public static function options(): array
    {
        $stmt = Database::connection()->query('SELECT id, name FROM clients ORDER BY name ASC LIMIT 1000');
        $out  = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[] = ['id' => (int) $row['id'], 'name' => (string) $row['name']];
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $d
     */
    public static function create(array $d, ?int $userId): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO clients (type, name, email, phone, address, city, notes, created_by, created_at, updated_at)
             VALUES (:type, :name, :email, :phone, :address, :city, :notes, :uid, NOW(), NOW())'
        );
        $stmt->execute([
            ':type'    => $d['type'],
            ':name'    => $d['name'],
            ':email'   => $d['email'],
            ':phone'   => $d['phone'],
            ':address' => $d['address'],
            ':city'    => $d['city'],
            ':notes'   => $d['notes'],
            ':uid'     => $userId,
        ]);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * @param array<string,mixed> $d
     */
    public static function update(int $id, array $d): void
    {
        $stmt = Database::connection()->prepare(
            'UPDATE clients
                SET type = :type, name = :name, email = :email, phone = :phone,
                    address = :address, city = :city, notes = :notes
              WHERE id = :id'
        );
        $stmt->execute([
            ':type'    => $d['type'],
            ':name'    => $d['name'],
            ':email'   => $d['email'],
            ':phone'   => $d['phone'],
            ':address' => $d['address'],
            ':city'    => $d['city'],
            ':notes'   => $d['notes'],
            ':id'      => $id,
        ]);
    }

    public static function delete(int $id): void
    {
        $stmt = Database::connection()->prepare('DELETE FROM clients WHERE id = :id');
        $stmt->execute([':id' => $id]);
    }
}
