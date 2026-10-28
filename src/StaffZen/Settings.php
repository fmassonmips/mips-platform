<?php
/**
 * StaffZen settings: working days, leave types (yearly allowance in
 * half-days, or not counted), public holidays. The first access creates the
 * settings row and three default types; their allowances follow common
 * Mauritian practice and must be checked against the company's contracts.
 */
declare(strict_types=1);

namespace App\StaffZen;

use App\Database;
use App\RendezVous\Booking;

final class Settings
{
    /** Defaults, editable: annual 20 days, sick 15 days, unpaid not counted. */
    private const DEFAULT_TYPES = [['Congé annuel', 40], ['Congé maladie', 30], ['Congé sans solde', null]];

    /**
     * @return array{work_days:string}
     */
    public static function get(int $orgId): array
    {
        $pdo  = Database::connection();
        $stmt = $pdo->prepare('SELECT work_days FROM staffzen_settings WHERE organization_id = :oid');
        $stmt->execute([':oid' => $orgId]);
        $days = $stmt->fetchColumn();
        if ($days === false) {
            $pdo->beginTransaction();
            try {
                $ins = $pdo->prepare('INSERT IGNORE INTO staffzen_settings (organization_id) VALUES (:oid)');
                $ins->execute([':oid' => $orgId]);
                if ($ins->rowCount() === 1) {
                    $type = $pdo->prepare('INSERT INTO staffzen_leave_types (organization_id, name, allowance_halfdays, created_at) VALUES (:oid, :n, :a, :at)');
                    foreach (self::DEFAULT_TYPES as [$name, $halfdays]) {
                        $type->execute([':oid' => $orgId, ':n' => $name, ':a' => $halfdays, ':at' => Booking::now()->format('Y-m-d H:i:s')]);
                    }
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            $days = '1111100';
        }
        return ['work_days' => (string) $days];
    }

    public static function saveWorkDays(int $orgId, string $days): ?string
    {
        if (!preg_match('/^[01]{7}$/', $days) || $days === '0000000') {
            return 'Choisissez au moins un jour travaillé.';
        }
        self::get($orgId);
        Database::connection()->prepare('UPDATE staffzen_settings SET work_days = :d WHERE organization_id = :oid')
            ->execute([':d' => $days, ':oid' => $orgId]);
        return null;
    }

    /**
     * @return list<array{id:int,name:string,allowance_halfdays:?int,active:bool,used:bool}>
     */
    public static function types(int $orgId, bool $activeOnly = false): array
    {
        self::get($orgId);
        $stmt = Database::connection()->prepare(
            'SELECT t.id, t.name, t.allowance_halfdays, t.active,
                    EXISTS (SELECT 1 FROM staffzen_requests r WHERE r.type_id = t.id) AS used
             FROM staffzen_leave_types t WHERE t.organization_id = :oid' . ($activeOnly ? ' AND t.active = 1' : '') . ' ORDER BY t.active DESC, t.id'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'name' => (string) $r['name'],
            'allowance_halfdays' => $r['allowance_halfdays'] !== null ? (int) $r['allowance_halfdays'] : null,
            'active' => (int) $r['active'] === 1, 'used' => (int) $r['used'] === 1,
        ], $stmt->fetchAll());
    }

    /**
     * @return array{id:int,name:string,allowance_halfdays:?int,active:bool,used:bool}|null
     */
    public static function type(int $orgId, int $id): ?array
    {
        foreach (self::types($orgId) as $t) {
            if ($t['id'] === $id) {
                return $t;
            }
        }
        return null;
    }

    /**
     * @param string $days "20", "2.5" or "" (not counted)
     * @return array{0:int,1:?string}
     */
    public static function saveType(int $orgId, int $id, string $name, string $days, bool $active): array
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
        if ($name === '' || mb_strlen($name) > 60) {
            return [0, 'Le nom est obligatoire (60 caractères max.).'];
        }
        $half = null;
        if (trim($days) !== '') {
            $half = Leaves::parseDays($days);
            if ($half === null || $half > 730) {
                return [0, 'Nombre de jours invalide (par demi-journée, ex. 20 ou 2.5).'];
            }
        }
        $pdo = Database::connection();
        if ($id === 0) {
            self::get($orgId);
            $pdo->prepare('INSERT INTO staffzen_leave_types (organization_id, name, allowance_halfdays, active, created_at) VALUES (:oid, :n, :a, 1, :at)')
                ->execute([':oid' => $orgId, ':n' => $name, ':a' => $half, ':at' => Booking::now()->format('Y-m-d H:i:s')]);
            return [(int) $pdo->lastInsertId(), null];
        }
        if (self::type($orgId, $id) === null) {
            return [0, 'Type de congé introuvable.'];
        }
        $pdo->prepare('UPDATE staffzen_leave_types SET name = :n, allowance_halfdays = :a, active = :ac WHERE organization_id = :oid AND id = :id')
            ->execute([':n' => $name, ':a' => $half, ':ac' => $active ? 1 : 0, ':oid' => $orgId, ':id' => $id]);
        return [$id, null];
    }

    public static function deleteType(int $orgId, int $id): ?string
    {
        $t = self::type($orgId, $id);
        if ($t === null) {
            return 'Type de congé introuvable.';
        }
        if ($t['used']) {
            return 'Ce type a déjà servi : désactivez-le plutôt que de le supprimer.';
        }
        Database::connection()->prepare('DELETE FROM staffzen_leave_types WHERE organization_id = :oid AND id = :id')->execute([':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * @return array<string,string> date => name
     */
    public static function holidays(int $orgId, ?int $year = null): array
    {
        $sql    = 'SELECT day, name FROM staffzen_holidays WHERE organization_id = :oid';
        $params = [':oid' => $orgId];
        if ($year !== null) {
            $sql .= ' AND day >= :f AND day <= :t';
            $params += [':f' => $year . '-01-01', ':t' => $year . '-12-31'];
        }
        $stmt = Database::connection()->prepare($sql . ' ORDER BY day');
        $stmt->execute($params);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['day']] = (string) $r['name'];
        }
        return $out;
    }

    public static function addHoliday(int $orgId, string $day, string $name): ?string
    {
        $name = trim($name);
        $d    = \DateTimeImmutable::createFromFormat('!Y-m-d', $day);
        if ($d === false || $d->format('Y-m-d') !== $day) {
            return 'Date invalide.';
        }
        if ($name === '' || mb_strlen($name) > 80) {
            return 'Le nom du jour férié est obligatoire (80 caractères max.).';
        }
        Database::connection()->prepare(
            'INSERT INTO staffzen_holidays (organization_id, day, name) VALUES (:oid, :d, :n) ON DUPLICATE KEY UPDATE name = VALUES(name)'
        )->execute([':oid' => $orgId, ':d' => $day, ':n' => $name]);
        return null;
    }

    public static function removeHoliday(int $orgId, string $day): ?string
    {
        $stmt = Database::connection()->prepare('DELETE FROM staffzen_holidays WHERE organization_id = :oid AND day = :d');
        $stmt->execute([':oid' => $orgId, ':d' => $day]);
        return $stmt->rowCount() === 1 ? null : 'Jour férié introuvable.';
    }
}
