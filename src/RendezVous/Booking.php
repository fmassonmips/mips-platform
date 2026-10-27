<?php
/**
 * Availability and appointments.
 *
 * Times, including created_at / cancelled_at, are local Mauritius time
 * (UTC+4, no daylight saving), set from PHP so the database server's time
 * zone never matters. Every booking
 * locks the staff rows it may use, then re-checks availability, so two
 * customers can never get the same slot with the same person.
 */
declare(strict_types=1);

namespace App\RendezVous;

use App\ClientBloom\Customers;
use App\Database;
use DateTimeImmutable;
use DateTimeZone;

final class Booking
{
    public const TZ = 'Indian/Mauritius';

    public const STATUS_LABELS = ['booked' => 'Confirmé', 'done' => 'Honoré', 'no_show' => 'Absent', 'cancelled' => 'Annulé'];

    /** Online bookings allowed per IP address per hour. */
    private const IP_LIMIT = 5;
    /** Upcoming online bookings allowed per phone number. */
    private const PHONE_LIMIT = 3;

    private const STAFF_ERRORS = [
        'err_service' => 'Choisissez une prestation.', 'err_name' => 'Le nom du client est obligatoire.',
        'err_phone' => 'Numéro de téléphone invalide.', 'err_email' => 'E-mail invalide.',
        'err_date' => 'Date ou heure invalide.', 'err_slot' => 'Ce créneau chevauche un autre rendez-vous de cette personne.',
    ];

    public static function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone(self::TZ));
    }

    public static function validDate(string $date): bool
    {
        return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) === 1 && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /**
     * Start times bookable online on $date for a service, with the staff free at each.
     * $staffId = 0 means anyone.
     *
     * @return list<array{time:string,staff:list<int>}>
     */
    public static function slots(int $orgId, int $serviceId, int $staffId, string $date): array
    {
        $service  = Services::find($orgId, $serviceId);
        $settings = Settings::get($orgId);
        if ($service === null || (int) $service['active'] !== 1 || !self::validDate($date)) {
            return [];
        }
        $tz    = new DateTimeZone(self::TZ);
        $day   = new DateTimeImmutable($date . ' 00:00', $tz);
        $now   = self::now();
        $today = $now->setTime(0, 0);
        if ($day < $today || $day > $today->modify('+' . $settings['max_days_ahead'] . ' days')) {
            return [];
        }
        // Earliest start, in minutes from the start of $date.
        $earliest = intdiv($now->modify('+' . $settings['min_notice_min'] . ' minutes')->getTimestamp() - $day->getTimestamp(), 60);

        $staff = $staffId > 0 ? array_filter([Staff::find($orgId, $staffId)], static fn ($s) => $s !== null && (int) $s['active'] === 1)
                              : Staff::all($orgId, true);
        $duration = (int) $service['duration_min'];
        $step     = $settings['slot_step_min'];
        $weekday  = (int) $day->format('N');

        $slots = [];
        foreach ($staff as $s) {
            $busy = self::busy((int) $s['id'], $date);
            foreach (Staff::hours((int) $s['id'])[$weekday] as [$from, $to]) {
                for ($t = self::minutes($from); $t + $duration <= self::minutes($to); $t += $step) {
                    if ($t < $earliest || self::overlaps($busy, $t, $t + $duration)) {
                        continue;
                    }
                    $slots[sprintf('%02d:%02d', intdiv($t, 60), $t % 60)][] = (int) $s['id'];
                }
            }
        }
        ksort($slots);
        $out = [];
        foreach ($slots as $time => $ids) {
            $out[] = ['time' => (string) $time, 'staff' => $ids];
        }
        return $out;
    }

    /**
     * Book an appointment. $source 'online' (customer, availability enforced)
     * or 'staff' (back office: any time, only overlaps refused).
     *
     * @param array<string,mixed> $in service_id, staff_id, date, time, name, phone, email, note
     * @param array<string,string> $t Text::for() of the customer's language (online)
     * @return array{0:?array<string,mixed>,1:?string}
     */
    public static function book(int $orgId, array $in, string $source, ?string $ip, array $t): array
    {
        $online = $source === 'online';
        $err    = static fn (string $key): string => $online ? $t[$key] : (self::STAFF_ERRORS[$key] ?? $t[$key]);

        $service = Services::find($orgId, (int) ($in['service_id'] ?? 0));
        if ($service === null || ($online && (int) $service['active'] !== 1)) {
            return [null, $err('err_service')];
        }
        $name  = trim(preg_replace('/\s+/u', ' ', (string) ($in['name'] ?? '')) ?? '');
        $phoneRaw = trim((string) ($in['phone'] ?? ''));
        $phone = $phoneRaw === '' ? null : Customers::normalizePhone($phoneRaw);
        $email = trim((string) ($in['email'] ?? ''));
        $note  = trim((string) ($in['note'] ?? ''));
        $date  = (string) ($in['date'] ?? '');
        $time  = (string) ($in['time'] ?? '');
        if ($name === '' || mb_strlen($name) > 120) {
            return [null, $err('err_name')];
        }
        if (($phoneRaw !== '' && $phone === null) || ($online && $phone === null)) {
            return [null, $err('err_phone')];
        }
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return [null, $err('err_email')];
        }
        if (!self::validDate($date) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
            return [null, $err('err_date')];
        }
        $note     = mb_substr($note, 0, 500);
        $staffId  = (int) ($in['staff_id'] ?? 0);
        $duration = (int) $service['duration_min'];
        $start    = self::minutes($time);

        $pdo = Database::connection();
        if ($online) {
            $rate = $pdo->prepare(
                'SELECT COUNT(*) FROM rendezvous_appointments
                 WHERE created_ip = :ip AND source = \'online\' AND created_at >= :since'
            );
            $rate->execute([':ip' => (string) $ip, ':since' => self::now()->modify('-1 hour')->format('Y-m-d H:i:s')]);
            if ((int) $rate->fetchColumn() >= self::IP_LIMIT) {
                return [null, $t['err_limit']];
            }
            $upcoming = $pdo->prepare(
                'SELECT COUNT(*) FROM rendezvous_appointments
                 WHERE organization_id = :oid AND phone = :p AND status = \'booked\' AND starts_at >= :now'
            );
            $upcoming->execute([':oid' => $orgId, ':p' => $phone, ':now' => self::now()->format('Y-m-d H:i:s')]);
            if ((int) $upcoming->fetchColumn() >= self::PHONE_LIMIT) {
                return [null, $t['err_phone_limit']];
            }
        } elseif ($staffId <= 0) {
            return [null, 'Choisissez la personne qui assure le rendez-vous.'];
        }

        $candidates = $staffId > 0 ? [$staffId] : array_map(static fn ($s): int => (int) $s['id'], Staff::all($orgId, true));
        $pdo->beginTransaction();
        try {
            // Lock first: the availability read below then sees every booking committed before ours.
            $locked = [];
            if ($candidates !== []) {
                $in_ = implode(',', array_map('intval', $candidates));
                $lock = $pdo->prepare(
                    "SELECT id FROM rendezvous_staff WHERE organization_id = :oid AND id IN ($in_) AND active = 1 ORDER BY id FOR UPDATE"
                );
                $lock->execute([':oid' => $orgId]);
                $locked = array_map('intval', $lock->fetchAll(\PDO::FETCH_COLUMN));
            }

            $chosen = null;
            if ($online) {
                foreach (self::slots($orgId, (int) $service['id'], $staffId, $date) as $slot) {
                    if ($slot['time'] === $time) {
                        $chosen = self::leastBusy(array_values(array_intersect($slot['staff'], $locked)), $date);
                        break;
                    }
                }
            } elseif (in_array($staffId, $locked, true) && !self::overlaps(self::busy($staffId, $date), $start, $start + $duration)) {
                $chosen = $staffId;
            }
            if ($chosen === null) {
                $pdo->rollBack();
                return [null, $staffId > 0 && !$online && !in_array($staffId, $locked, true)
                    ? 'Cette personne n\'est pas active dans l\'équipe.' : $err('err_slot')];
            }

            $startsAt = new DateTimeImmutable($date . ' ' . $time, new DateTimeZone(self::TZ));
            $token    = bin2hex(random_bytes(24));
            $pdo->prepare(
                'INSERT INTO rendezvous_appointments
                    (organization_id, staff_id, service_id, starts_at, ends_at, customer_name, phone, email, note, source, token, created_ip, created_at)
                 VALUES (:oid, :staff, :service, :s, :e, :name, :phone, :email, :note, :source, :token, :ip, :created)'
            )->execute([
                ':oid' => $orgId, ':staff' => $chosen, ':service' => (int) $service['id'],
                ':s' => $startsAt->format('Y-m-d H:i:s'), ':e' => $startsAt->modify("+$duration minutes")->format('Y-m-d H:i:s'),
                ':name' => $name, ':phone' => $phone, ':email' => $email !== '' ? $email : null,
                ':note' => $note !== '' ? $note : null, ':source' => $online ? 'online' : 'staff',
                ':token' => $token, ':ip' => $online ? $ip : null, ':created' => self::now()->format('Y-m-d H:i:s'),
            ]);
            $id = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (\Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $ex;
        }

        $appt = self::find($orgId, $id);
        Notifier::safely(static fn () => Notifier::booked($orgId, $appt));
        return [$appt, null];
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $rows = self::query('a.organization_id = :oid AND a.id = :id', [':oid' => $orgId, ':id' => $id]);
        return $rows[0] ?? null;
    }

    /**
     * @return array{0:int,1:array<string,mixed>}|null [orgId, appointment]
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{48}$/', $token)) {
            return null;
        }
        $rows = self::query('a.token = :t', [':t' => $token]);
        return isset($rows[0]) ? [(int) $rows[0]['organization_id'], $rows[0]] : null;
    }

    /**
     * Appointments from $from (inclusive) to $to (exclusive), dates Y-m-d.
     *
     * @return list<array<string,mixed>>
     */
    public static function between(int $orgId, string $from, string $to, bool $withCancelled = true): array
    {
        return self::query(
            'a.organization_id = :oid AND a.starts_at >= :from AND a.starts_at < :to' . ($withCancelled ? '' : ' AND a.status <> \'cancelled\''),
            [':oid' => $orgId, ':from' => $from . ' 00:00:00', ':to' => $to . ' 00:00:00']
        );
    }

    /**
     * Back office status change. Cancelled is final (the slot may be taken since).
     */
    public static function setStatus(int $orgId, int $id, string $status): ?string
    {
        $appt = self::find($orgId, $id);
        if ($appt === null) {
            return 'Rendez-vous introuvable.';
        }
        $allowed = [
            'booked'  => ['done', 'no_show', 'cancelled'],
            'done'    => ['booked'],
            'no_show' => ['booked'],
        ];
        if (!in_array($status, $allowed[$appt['status']] ?? [], true)) {
            return 'Changement de statut impossible.';
        }
        Database::connection()->prepare(
            'UPDATE rendezvous_appointments SET status = :s, cancelled_at = IF(:s2 = \'cancelled\', :now, cancelled_at)
             WHERE organization_id = :oid AND id = :id AND status = :old'
        )->execute([':s' => $status, ':s2' => $status, ':now' => self::now()->format('Y-m-d H:i:s'),
                     ':oid' => $orgId, ':id' => $id, ':old' => $appt['status']]);
        if ($status === 'cancelled') {
            Notifier::safely(static fn () => Notifier::cancelled($orgId, self::find($orgId, $id), false));
        }
        return null;
    }

    /**
     * Customer cancellation from the manage link. Returns an error message or null.
     *
     * @param array<string,string> $t
     */
    public static function cancelByToken(string $token, array $t): ?string
    {
        $found = self::findByToken($token);
        if ($found === null) {
            return $t['not_found'];
        }
        [$orgId, $appt] = $found;
        if ($appt['status'] !== 'booked') {
            return $t['cancelled'];
        }
        if (!self::cancellableOnline($orgId, $appt)) {
            $phone = \App\Suite\Tenant::profile($orgId)['phone'];
            return sprintf($t['cancel_too_late'], $phone !== '' ? sprintf($t['call_us'], $phone) : '');
        }
        Database::connection()->prepare(
            'UPDATE rendezvous_appointments SET status = \'cancelled\', cancelled_at = :now
             WHERE id = :id AND status = \'booked\''
        )->execute([':id' => (int) $appt['id'], ':now' => self::now()->format('Y-m-d H:i:s')]);
        Notifier::safely(static fn () => Notifier::cancelled($orgId, self::find($orgId, (int) $appt['id']), true));
        return null;
    }

    /**
     * @param array<string,mixed> $appt
     */
    public static function cancellableOnline(int $orgId, array $appt): bool
    {
        $limit = self::now()->modify('+' . Settings::get($orgId)['cancel_notice_min'] . ' minutes');
        return $appt['status'] === 'booked'
            && new DateTimeImmutable((string) $appt['starts_at'], new DateTimeZone(self::TZ)) >= $limit;
    }

    /**
     * ClientBloom customers matching the appointments' phone numbers, by phone.
     *
     * @param list<array<string,mixed>> $appointments
     * @return array<string,array{id:int,balance_cents:int}>
     */
    public static function loyaltyByPhone(int $orgId, array $appointments): array
    {
        $phones = array_values(array_unique(array_filter(array_map(static fn ($a) => $a['phone'], $appointments))));
        if ($phones === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($phones), '?'));
        $stmt  = Database::connection()->prepare(
            "SELECT id, phone, balance_cents FROM clientbloom_customers
             WHERE organization_id = ? AND erased_at IS NULL AND phone IN ($marks)"
        );
        $stmt->execute(array_merge([$orgId], $phones));
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['phone']] = ['id' => (int) $r['id'], 'balance_cents' => (int) $r['balance_cents']];
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $params
     * @return list<array<string,mixed>>
     */
    private static function query(string $where, array $params): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT a.*, s.name AS service_name, s.duration_min, s.price_cents, st.name AS staff_name
             FROM rendezvous_appointments a
             JOIN rendezvous_services s ON s.id = a.service_id
             JOIN rendezvous_staff st   ON st.id = a.staff_id
             WHERE ' . $where . ' ORDER BY a.starts_at, st.name'
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Non-cancelled appointments of a staff member on $date, as [start, end] minutes of that day.
     *
     * @return list<array{0:int,1:int}>
     */
    private static function busy(int $staffId, string $date): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT starts_at, ends_at FROM rendezvous_appointments
             WHERE staff_id = :id AND status <> \'cancelled\'
               AND starts_at < :next AND ends_at > :day'
        );
        $next = (new DateTimeImmutable($date))->modify('+1 day')->format('Y-m-d');
        $stmt->execute([':id' => $staffId, ':next' => $next . ' 00:00:00', ':day' => $date . ' 00:00:00']);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $s = substr((string) $r['starts_at'], 0, 10) < $date ? 0 : self::minutes(substr((string) $r['starts_at'], 11, 5));
            $e = substr((string) $r['ends_at'], 0, 10) > $date ? 24 * 60 : self::minutes(substr((string) $r['ends_at'], 11, 5));
            $out[] = [$s, $e];
        }
        return $out;
    }

    /**
     * @param list<int> $staffIds
     */
    private static function leastBusy(array $staffIds, string $date): ?int
    {
        $best = null;
        $min  = PHP_INT_MAX;
        foreach ($staffIds as $id) {
            $load = array_sum(array_map(static fn (array $b): int => $b[1] - $b[0], self::busy($id, $date)));
            if ($load < $min) {
                [$best, $min] = [$id, $load];
            }
        }
        return $best;
    }

    /**
     * @param list<array{0:int,1:int}> $busy
     */
    private static function overlaps(array $busy, int $start, int $end): bool
    {
        foreach ($busy as [$s, $e]) {
            if ($start < $e && $end > $s) {
                return true;
            }
        }
        return false;
    }

    private static function minutes(string $hhmm): int
    {
        return (int) substr($hhmm, 0, 2) * 60 + (int) substr($hhmm, 3, 2);
    }
}
