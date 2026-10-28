<?php
/**
 * Leave requests. Days are counted in half-days over the company's working
 * days, public holidays excluded, and frozen on the request. Pending and
 * approved leave both reserve the balance; a request is checked against
 * overlaps and the balance under a lock on the company's settings row, so
 * two requests sent together cannot overdraw it. Times are Mauritius local
 * time, written by the application.
 */
declare(strict_types=1);

namespace App\StaffZen;

use App\Database;
use App\RendezVous\Booking;
use App\Suite\Tenant;

final class Leaves
{
    public const STATUSES = ['pending' => 'En attente', 'approved' => 'Accordé', 'refused' => 'Refusé', 'cancelled' => 'Annulé'];
    public const HALVES   = ['am' => 'matin', 'pm' => 'après-midi'];

    private const MAX_SPAN_DAYS  = 92;
    private const PAST_DAYS_SELF = 30;   // a member may declare a recent absence (sick day) after the fact

    /** "20" → 40, "2.5" / "2,5" → 5 half-days; null when not a multiple of a half day. */
    public static function parseDays(string $value): ?int
    {
        if (!preg_match('/^(\d{1,3})(?:[.,](0|5|00|50))?$/', trim($value), $m)) {
            return null;
        }
        return (int) $m[1] * 2 + (isset($m[2]) && $m[2][0] === '5' ? 1 : 0);
    }

    /** 5 → "2,5 j" */
    public static function days(int $halfdays): string
    {
        $sign = $halfdays < 0 ? '-' : '';
        $abs  = abs($halfdays);
        return $sign . intdiv($abs, 2) . ($abs % 2 === 1 ? ',5' : '') . ' j';
    }

    public static function today(): string
    {
        return Booking::now()->format('Y-m-d');
    }

    /**
     * Half-days of leave between two dates (inclusive) for this company.
     *
     * @return array{0:int,1:?string}
     */
    public static function count(int $orgId, string $start, string $end, ?string $half): array
    {
        $s = self::date($start);
        $e = self::date($end);
        if ($s === null || $e === null) {
            return [0, 'Dates invalides.'];
        }
        if ($e < $s) {
            return [0, 'La date de fin est avant la date de début.'];
        }
        if ($s->format('Y') !== $e->format('Y')) {
            return [0, 'Un congé à cheval sur deux années se pose en deux demandes (jusqu\'au 31/12, puis à partir du 01/01).'];
        }
        if ((int) $s->diff($e)->days >= self::MAX_SPAN_DAYS) {
            return [0, 'Une demande couvre au plus ' . self::MAX_SPAN_DAYS . ' jours ; faites-en plusieurs.'];
        }
        if ($half !== null && ($start !== $end || !isset(self::HALVES[$half]))) {
            return [0, 'La demi-journée ne s\'applique qu\'à une demande d\'un seul jour.'];
        }
        $work     = Settings::get($orgId)['work_days'];
        $holidays = Settings::holidays($orgId, (int) $s->format('Y'));
        $n = 0;
        for ($d = $s; $d <= $e; $d = $d->modify('+1 day')) {
            if ($work[(int) $d->format('N') - 1] === '1' && !isset($holidays[$d->format('Y-m-d')])) {
                $n += 2;
            }
        }
        if ($n === 0) {
            return [0, 'Aucun jour travaillé sur cette période (week-end ou jour férié).'];
        }
        return [$half !== null ? 1 : $n, null];
    }

    /**
     * New request for oneself (pending), or leave recorded by a manager for a
     * member (approved at once).
     *
     * @param array{id:int,name:string,role:string} $org
     * @param array<string,string|int>              $in  user_id, type_id, start, end, half ('' | am | pm), note
     * @return array{0:int,1:?string}
     */
    public static function request(array $org, int $actorId, array $in, bool $record): array
    {
        $orgId  = $org['id'];
        $userId = $record ? (int) $in['user_id'] : $actorId;
        $start  = (string) $in['start'];
        $end    = (string) ($in['end'] !== '' ? $in['end'] : $in['start']);
        $half   = in_array($in['half'], ['am', 'pm'], true) ? (string) $in['half'] : null;
        $note   = mb_substr(trim((string) $in['note']), 0, 500);

        if ($record && !Tenant::canManage($org)) {
            return [0, 'Seul un propriétaire ou administrateur peut enregistrer une absence pour quelqu\'un.'];
        }
        if (!isset(Tenant::members($orgId)[$userId])) {
            return [0, 'Membre introuvable.'];
        }
        $type = Settings::type($orgId, (int) $in['type_id']);
        if ($type === null || !$type['active']) {
            return [0, 'Type de congé invalide.'];
        }
        [$halfdays, $error] = self::count($orgId, $start, $end, $half);
        if ($error !== null) {
            return [0, $error];
        }
        $today = Booking::now();
        if (!$record && $start < $today->modify('-' . self::PAST_DAYS_SELF . ' days')->format('Y-m-d')) {
            return [0, 'Une absence de plus de ' . self::PAST_DAYS_SELF . ' jours se fait enregistrer par un responsable.'];
        }
        if ($start > $today->modify('+18 months')->format('Y-m-d')) {
            return [0, 'Date trop lointaine.'];
        }
        $year = (int) substr($start, 0, 4);

        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            // One company's requests are checked one at a time: no double booking, no overdrawn balance.
            $pdo->prepare('SELECT organization_id FROM staffzen_settings WHERE organization_id = :oid FOR UPDATE')->execute([':oid' => $orgId]);

            $ov = $pdo->prepare(
                'SELECT start_date, end_date, half_day FROM staffzen_requests
                 WHERE organization_id = :oid AND user_id = :u AND status IN (\'pending\', \'approved\') AND start_date <= :e AND end_date >= :s'
            );
            $ov->execute([':oid' => $orgId, ':u' => $userId, ':e' => $end, ':s' => $start]);
            foreach ($ov->fetchAll() as $o) {
                // Morning off and afternoon off on the same day can both stand.
                $complementary = $half !== null && $o['half_day'] !== null && $o['half_day'] !== $half;
                if (!$complementary) {
                    $pdo->rollBack();
                    return [0, 'Une demande existe déjà sur ces dates (' . self::period((string) $o['start_date'], (string) $o['end_date'], $o['half_day']) . ').'];
                }
            }

            if ($type['allowance_halfdays'] !== null) {
                $left = self::remaining($orgId, $userId, $type, $year);
                if ($halfdays > $left) {
                    $pdo->rollBack();
                    return [0, 'Solde insuffisant : ' . $type['name'] . ' — il reste ' . self::days(max(0, $left)) . ' en ' . $year
                        . ', la demande en compte ' . self::days($halfdays) . '.'];
                }
            }

            $now = $today->format('Y-m-d H:i:s');
            $pdo->prepare(
                'INSERT INTO staffzen_requests (organization_id, user_id, type_id, start_date, end_date, half_day, halfdays, status, note,
                                                decided_by, decided_at, created_by, created_at)
                 VALUES (:oid, :u, :t, :s, :e, :h, :n, :st, :note, :db, :da, :cb, :at)'
            )->execute([
                ':oid' => $orgId, ':u' => $userId, ':t' => $type['id'], ':s' => $start, ':e' => $end, ':h' => $half, ':n' => $halfdays,
                ':st' => $record ? 'approved' : 'pending', ':note' => $note !== '' ? $note : null,
                ':db' => $record ? $actorId : null, ':da' => $record ? $now : null, ':cb' => $actorId, ':at' => $now,
            ]);
            $id = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $r = self::find($orgId, $id);
        Notifier::safely(static fn () => $record ? Notifier::recorded($orgId, $r) : Notifier::requested($orgId, $r));
        return [$id, null];
    }

    /**
     * @param array{id:int,name:string,role:string} $org
     */
    public static function decide(array $org, int $actorId, int $id, bool $approve, string $note): ?string
    {
        if (!Tenant::canManage($org)) {
            return 'Seul un propriétaire ou administrateur peut valider les congés.';
        }
        $r = self::find($org['id'], $id);
        if ($r === null) {
            return 'Demande introuvable.';
        }
        if ((int) $r['user_id'] === $actorId && $org['role'] !== 'owner') {
            return 'Votre propre demande doit être validée par un autre responsable.';
        }
        $note = mb_substr(trim($note), 0, 500);
        $upd  = Database::connection()->prepare(
            'UPDATE staffzen_requests SET status = :st, decision_note = :n, decided_by = :by, decided_at = :at
             WHERE organization_id = :oid AND id = :id AND status = \'pending\''
        );
        $upd->execute([
            ':st' => $approve ? 'approved' : 'refused', ':n' => $note !== '' ? $note : null, ':by' => $actorId,
            ':at' => Booking::now()->format('Y-m-d H:i:s'), ':oid' => $org['id'], ':id' => $id,
        ]);
        if ($upd->rowCount() !== 1) {
            return 'Cette demande a déjà été traitée.';
        }
        Notifier::safely(static fn () => Notifier::decided($org['id'], self::find($org['id'], $id)));
        return null;
    }

    /**
     * The person cancels a pending request or approved leave not yet started;
     * a manager cancels any pending or approved leave.
     *
     * @param array{id:int,name:string,role:string} $org
     */
    public static function cancel(array $org, int $actorId, int $id): ?string
    {
        $r = self::find($org['id'], $id);
        $manager = Tenant::canManage($org);
        if ($r === null || (!$manager && (int) $r['user_id'] !== $actorId)) {
            return 'Demande introuvable.';
        }
        if (!in_array($r['status'], ['pending', 'approved'], true)) {
            return 'Cette demande ne peut plus être annulée.';
        }
        if (!$manager && $r['status'] === 'approved' && $r['start_date'] <= self::today()) {
            return 'Ce congé a commencé : demandez à un responsable de le modifier.';
        }
        $upd = Database::connection()->prepare(
            'UPDATE staffzen_requests SET status = \'cancelled\', decided_by = :by, decided_at = :at
             WHERE organization_id = :oid AND id = :id AND status = :old'
        );
        $upd->execute([':by' => $actorId, ':at' => Booking::now()->format('Y-m-d H:i:s'), ':oid' => $org['id'], ':id' => $id, ':old' => $r['status']]);
        if ($upd->rowCount() !== 1) {
            return 'Cette demande vient de changer. Rechargez la page.';
        }
        if ($r['status'] === 'approved') {
            Notifier::safely(static fn () => Notifier::cancelled($org['id'], $actorId, self::find($org['id'], $id)));
        }
        return null;
    }

    /**
     * @return array<string,mixed>|null with user_name, type_name, decided_by_name
     */
    public static function find(int $orgId, int $id): ?array
    {
        $rows = self::select('r.organization_id = :oid AND r.id = :id', [':oid' => $orgId, ':id' => $id]);
        return $rows[0] ?? null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function forUser(int $orgId, int $userId, int $limit = 50): array
    {
        return self::select('r.organization_id = :oid AND r.user_id = :u', [':oid' => $orgId, ':u' => $userId], 'r.start_date DESC, r.id DESC', $limit);
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function pending(int $orgId): array
    {
        return self::select('r.organization_id = :oid AND r.status = \'pending\'', [':oid' => $orgId], 'r.start_date, r.id');
    }

    /**
     * Recently decided or recorded, for the approvals page.
     *
     * @return list<array<string,mixed>>
     */
    public static function recent(int $orgId, int $limit = 20): array
    {
        return self::select('r.organization_id = :oid AND r.status <> \'pending\'', [':oid' => $orgId], 'r.decided_at DESC, r.id DESC', $limit);
    }

    public static function pendingCount(int $orgId): int
    {
        $stmt = Database::connection()->prepare('SELECT COUNT(*) FROM staffzen_requests WHERE organization_id = :oid AND status = \'pending\'');
        $stmt->execute([':oid' => $orgId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Members away today (approved leave), name => "matin" / "après-midi" / "".
     *
     * @return array<string,string>
     */
    public static function awayToday(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COALESCE(NULLIF(u.name, \'\'), u.email) AS name, r.half_day
             FROM staffzen_requests r JOIN users u ON u.id = r.user_id
             JOIN organization_users ou ON ou.organization_id = r.organization_id AND ou.user_id = r.user_id
             WHERE r.organization_id = :oid AND r.status = \'approved\' AND r.start_date <= :d AND r.end_date >= :d2 ORDER BY name'
        );
        $d = self::today();
        $stmt->execute([':oid' => $orgId, ':d' => $d, ':d2' => $d]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['name']] = $r['half_day'] !== null ? self::HALVES[$r['half_day']] : '';
        }
        return $out;
    }

    /**
     * Balance of each active type for one person and year.
     *
     * @return list<array{type_id:int,name:string,counted:bool,allowance:?int,taken:int,pending:int,remaining:?int,custom:bool}>
     */
    public static function balances(int $orgId, int $userId, int $year): array
    {
        $used = self::usage($orgId, $year, $userId);
        $over = self::overrides($orgId, $year, $userId);
        $out  = [];
        foreach (Settings::types($orgId, true) as $t) {
            $taken   = $used[$userId][$t['id']]['approved'] ?? 0;
            $pending = $used[$userId][$t['id']]['pending'] ?? 0;
            $allow   = $t['allowance_halfdays'] !== null ? ($over[$userId][$t['id']] ?? $t['allowance_halfdays']) : null;
            $out[] = [
                'type_id' => $t['id'], 'name' => $t['name'], 'counted' => $allow !== null, 'allowance' => $allow,
                'taken' => $taken, 'pending' => $pending, 'remaining' => $allow !== null ? $allow - $taken - $pending : null,
                'custom' => isset($over[$userId][$t['id']]),
            ];
        }
        return $out;
    }

    /**
     * Balances of every member for one year: [user_id => balances()].
     *
     * @return array<int,list<array<string,mixed>>>
     */
    public static function teamBalances(int $orgId, int $year): array
    {
        $out = [];
        foreach (array_keys(Tenant::members($orgId)) as $uid) {
            $out[$uid] = self::balances($orgId, $uid, $year);
        }
        return $out;
    }

    /**
     * Per-person allowance for a year ("" = back to the type's default).
     */
    public static function setAllowance(int $orgId, int $userId, int $typeId, int $year, string $days): ?string
    {
        if (!isset(Tenant::members($orgId)[$userId])) {
            return 'Membre introuvable.';
        }
        $t = Settings::type($orgId, $typeId);
        if ($t === null || $t['allowance_halfdays'] === null) {
            return 'Ce type de congé n\'est pas décompté.';
        }
        if ($year < 2000 || $year > 2100) {
            return 'Année invalide.';
        }
        $pdo = Database::connection();
        if (trim($days) === '') {
            $pdo->prepare('DELETE FROM staffzen_allowances WHERE type_id = :t AND user_id = :u AND year = :y')
                ->execute([':t' => $typeId, ':u' => $userId, ':y' => $year]);
            return null;
        }
        $half = self::parseDays($days);
        if ($half === null || $half > 730) {
            return 'Nombre de jours invalide (par demi-journée, ex. 22 ou 22.5).';
        }
        $pdo->prepare('INSERT INTO staffzen_allowances (type_id, user_id, year, halfdays) VALUES (:t, :u, :y, :h) ON DUPLICATE KEY UPDATE halfdays = VALUES(halfdays)')
            ->execute([':t' => $typeId, ':u' => $userId, ':y' => $year, ':h' => $half]);
        return null;
    }

    /**
     * Approved and pending leave overlapping a month, for the team calendar.
     *
     * @return array<int,array<string,array{status:string,type:string,half:?string}>> user_id => date => cell
     */
    public static function calendar(int $orgId, string $monthStart): array
    {
        $first = new \DateTimeImmutable($monthStart);
        $last  = $first->modify('last day of this month');
        $stmt  = Database::connection()->prepare(
            'SELECT r.user_id, r.start_date, r.end_date, r.half_day, r.status, t.name AS type_name
             FROM staffzen_requests r JOIN staffzen_leave_types t ON t.id = r.type_id
             WHERE r.organization_id = :oid AND r.status IN (\'pending\', \'approved\') AND r.start_date <= :l AND r.end_date >= :f'
        );
        $stmt->execute([':oid' => $orgId, ':l' => $last->format('Y-m-d'), ':f' => $first->format('Y-m-d')]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $from = max($r['start_date'], $first->format('Y-m-d'));
            $to   = min($r['end_date'], $last->format('Y-m-d'));
            for ($d = new \DateTimeImmutable($from); $d->format('Y-m-d') <= $to; $d = $d->modify('+1 day')) {
                $out[(int) $r['user_id']][$d->format('Y-m-d')] = ['status' => (string) $r['status'], 'type' => (string) $r['type_name'], 'half' => $r['half_day']];
            }
        }
        return $out;
    }

    /** "03/11/2026 → 07/11/2026", "03/11/2026 (matin)" */
    public static function period(string $start, string $end, ?string $half): string
    {
        $f = static fn (string $d): string => substr($d, 8, 2) . '/' . substr($d, 5, 2) . '/' . substr($d, 0, 4);
        if ($start === $end) {
            return $f($start) . ($half !== null ? ' (' . self::HALVES[$half] . ')' : '');
        }
        return $f($start) . ' → ' . $f($end);
    }

    /**
     * @param array{id:int,allowance_halfdays:?int} $type
     */
    private static function remaining(int $orgId, int $userId, array $type, int $year): int
    {
        $used  = self::usage($orgId, $year, $userId)[$userId][$type['id']] ?? ['approved' => 0, 'pending' => 0];
        $allow = self::overrides($orgId, $year, $userId)[$userId][$type['id']] ?? (int) $type['allowance_halfdays'];
        return $allow - $used['approved'] - $used['pending'];
    }

    /**
     * @return array<int,array<int,array{approved:int,pending:int}>>
     */
    private static function usage(int $orgId, int $year, ?int $userId = null): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT user_id, type_id, status, SUM(halfdays) AS h FROM staffzen_requests
             WHERE organization_id = :oid AND status IN (\'approved\', \'pending\') AND start_date >= :f AND start_date <= :t'
            . ($userId !== null ? ' AND user_id = :u' : '') . ' GROUP BY user_id, type_id, status'
        );
        $params = [':oid' => $orgId, ':f' => $year . '-01-01', ':t' => $year . '-12-31'] + ($userId !== null ? [':u' => $userId] : []);
        $stmt->execute($params);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['user_id']][(int) $r['type_id']] ??= ['approved' => 0, 'pending' => 0];
            $out[(int) $r['user_id']][(int) $r['type_id']][(string) $r['status']] = (int) $r['h'];
        }
        return $out;
    }

    /**
     * @return array<int,array<int,int>>
     */
    private static function overrides(int $orgId, int $year, ?int $userId = null): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT a.user_id, a.type_id, a.halfdays FROM staffzen_allowances a JOIN staffzen_leave_types t ON t.id = a.type_id
             WHERE t.organization_id = :oid AND a.year = :y' . ($userId !== null ? ' AND a.user_id = :u' : '')
        );
        $stmt->execute([':oid' => $orgId, ':y' => $year] + ($userId !== null ? [':u' => $userId] : []));
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['user_id']][(int) $r['type_id']] = (int) $r['halfdays'];
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $params
     * @return list<array<string,mixed>>
     */
    private static function select(string $where, array $params, string $order = 'r.id', int $limit = 300): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT r.*, COALESCE(NULLIF(u.name, \'\'), u.email) AS user_name, u.email AS user_email, t.name AS type_name,
                    t.allowance_halfdays IS NOT NULL AS counted, COALESCE(NULLIF(d.name, \'\'), d.email) AS decided_by_name
             FROM staffzen_requests r JOIN users u ON u.id = r.user_id JOIN staffzen_leave_types t ON t.id = r.type_id
             LEFT JOIN users d ON d.id = r.decided_by
             WHERE ' . $where . ' ORDER BY ' . $order . ' LIMIT ' . $limit
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    private static function date(string $value): ?\DateTimeImmutable
    {
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $d !== false && $d->format('Y-m-d') === $value ? $d : null;
    }
}
