<?php
/**
 * People (or rooms, chairs…) with their own agenda and weekly working hours.
 */
declare(strict_types=1);

namespace App\RendezVous;

use App\Database;

final class Staff
{
    public const WEEKDAYS = [1 => 'Lundi', 2 => 'Mardi', 3 => 'Mercredi', 4 => 'Jeudi', 5 => 'Vendredi', 6 => 'Samedi', 7 => 'Dimanche'];

    /**
     * @return list<array<string,mixed>>
     */
    public static function all(int $orgId, bool $activeOnly = false): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, active FROM rendezvous_staff WHERE organization_id = :oid'
            . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY active DESC, name'
        );
        $stmt->execute([':oid' => $orgId]);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT id, name, active FROM rendezvous_staff WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Weekly hours: weekday => list of [start "HH:MM", end "HH:MM"].
     *
     * @return array<int,list<array{0:string,1:string}>>
     */
    public static function hours(int $staffId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT weekday, start_time, end_time FROM rendezvous_hours WHERE staff_id = :id ORDER BY weekday, start_time'
        );
        $stmt->execute([':id' => $staffId]);
        $hours = array_fill_keys(array_keys(self::WEEKDAYS), []);
        foreach ($stmt->fetchAll() as $r) {
            $hours[(int) $r['weekday']][] = [substr((string) $r['start_time'], 0, 5), substr((string) $r['end_time'], 0, 5)];
        }
        return $hours;
    }

    /** [[start,end],…] → "08:00-12:00, 13:00-17:00" */
    public static function formatRanges(array $ranges): string
    {
        return implode(', ', array_map(static fn (array $r): string => $r[0] . '-' . $r[1], $ranges));
    }

    /**
     * "8h-12h, 13:30-17" → [["08:00","12:00"],["13:30","17:00"]]. Empty = closed.
     *
     * @return array{0:list<array{0:string,1:string}>,1:?string}
     */
    public static function parseRanges(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return [[], null];
        }
        $ranges = [];
        foreach (preg_split('/[,;]+/', $raw) ?: [] as $part) {
            if (!preg_match('/^\s*(\d{1,2})(?:[:h](\d{2})?)?\s*[-–à]\s*(\d{1,2})(?:[:h](\d{2})?)?\s*$/u', $part, $m)) {
                return [[], 'Horaires illisibles : « ' . trim($part) . ' ». Exemple : 08:00-12:00, 13:00-17:00.'];
            }
            $start = sprintf('%02d:%02d', (int) $m[1], (int) ($m[2] ?? 0));
            $end   = sprintf('%02d:%02d', (int) $m[3], (int) ($m[4] ?? 0));
            $badEnd = (int) $m[3] > 24 || ((int) $m[3] === 24 && (int) ($m[4] ?? 0) > 0);
            if ((int) $m[1] > 23 || $badEnd || (int) ($m[2] ?? 0) > 59 || (int) ($m[4] ?? 0) > 59 || $start >= $end) {
                return [[], 'Plage horaire invalide : « ' . trim($part) . ' ».'];
            }
            $ranges[] = [$start, $end === '24:00' ? '23:59' : $end];
        }
        usort($ranges, static fn (array $a, array $b): int => strcmp($a[0], $b[0]));
        for ($i = 1, $n = count($ranges); $i < $n; $i++) {
            if ($ranges[$i][0] < $ranges[$i - 1][1]) {
                return [[], 'Des plages horaires se chevauchent : ' . self::formatRanges($ranges) . '.'];
            }
        }
        return [$ranges, null];
    }

    /**
     * Insert (id = 0) or update a staff member and their weekly hours.
     * $hours: weekday => raw text ("08:00-12:00, 13:00-17:00").
     *
     * @param array<int|string,string> $hours
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $id, string $name, bool $active, array $hours): array
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            return [0, 'Le nom est obligatoire (120 caractères max.).'];
        }
        $parsed = [];
        foreach (self::WEEKDAYS as $day => $label) {
            [$ranges, $error] = self::parseRanges((string) ($hours[$day] ?? $hours[(string) $day] ?? ''));
            if ($error !== null) {
                return [0, $label . ' : ' . $error];
            }
            $parsed[$day] = $ranges;
        }

        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            if ($id === 0) {
                $pdo->prepare('INSERT INTO rendezvous_staff (organization_id, name, active) VALUES (:oid, :n, :a)')
                    ->execute([':oid' => $orgId, ':n' => $name, ':a' => $active ? 1 : 0]);
                $id = (int) $pdo->lastInsertId();
            } else {
                if (self::find($orgId, $id) === null) {
                    $pdo->rollBack();
                    return [0, 'Membre de l\'équipe introuvable.'];
                }
                $pdo->prepare('UPDATE rendezvous_staff SET name = :n, active = :a WHERE organization_id = :oid AND id = :id')
                    ->execute([':n' => $name, ':a' => $active ? 1 : 0, ':oid' => $orgId, ':id' => $id]);
                $pdo->prepare('DELETE FROM rendezvous_hours WHERE staff_id = :id')->execute([':id' => $id]);
            }
            $ins = $pdo->prepare('INSERT INTO rendezvous_hours (staff_id, weekday, start_time, end_time) VALUES (:id, :d, :s, :e)');
            foreach ($parsed as $day => $ranges) {
                foreach ($ranges as [$s, $e]) {
                    $ins->execute([':id' => $id, ':d' => $day, ':s' => $s, ':e' => $e]);
                }
            }
            $pdo->commit();
        } catch (\Throwable $ex) {
            $pdo->rollBack();
            throw $ex;
        }
        return [$id, null];
    }
}
