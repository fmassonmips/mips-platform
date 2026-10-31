<?php
/**
 * Bookable services (name, duration, optional price), per organization.
 */
declare(strict_types=1);

namespace App\RendezVous;

use App\Database;
use App\Facturo\Money;

final class Services
{
    /**
     * @return list<array<string,mixed>>
     */
    public static function all(int $orgId, bool $activeOnly = false): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, duration_min, price_cents, active FROM rendezvous_services
             WHERE organization_id = :oid' . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY active DESC, name'
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
            'SELECT id, name, duration_min, price_cents, active FROM rendezvous_services WHERE organization_id = :oid AND id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Insert (id = 0) or update. Returns [id, error|null].
     *
     * @param array<string,mixed> $in name, duration_min, price (decimal string, optional), active
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $id, array $in): array
    {
        $name     = trim((string) ($in['name'] ?? ''));
        $duration = (int) ($in['duration_min'] ?? 0);
        $priceRaw = trim((string) ($in['price'] ?? ''));
        $price    = $priceRaw === '' ? null : Money::parseCents($priceRaw);
        if ($name === '' || mb_strlen($name) > 120) {
            return [0, 'Le nom de la prestation est obligatoire (120 caractères max.).'];
        }
        if ($duration < 5 || $duration > 720) {
            return [0, 'La durée doit être comprise entre 5 minutes et 12 heures.'];
        }
        if ($priceRaw !== '' && ($price === null || $price < 0)) {
            return [0, 'Prix invalide.'];
        }
        $params = [':oid' => $orgId, ':name' => $name, ':d' => $duration, ':p' => $price, ':a' => !empty($in['active']) ? 1 : 0];
        $pdo    = Database::connection();
        if ($id === 0) {
            $pdo->prepare(
                'INSERT INTO rendezvous_services (organization_id, name, duration_min, price_cents, active)
                 VALUES (:oid, :name, :d, :p, :a)'
            )->execute($params);
            return [(int) $pdo->lastInsertId(), null];
        }
        if (self::find($orgId, $id) === null) {
            return [0, 'Prestation introuvable.'];
        }
        $pdo->prepare(
            'UPDATE rendezvous_services SET name = :name, duration_min = :d, price_cents = :p, active = :a
             WHERE organization_id = :oid AND id = :id'
        )->execute($params + [':id' => $id]);
        return [$id, null];
    }
}
