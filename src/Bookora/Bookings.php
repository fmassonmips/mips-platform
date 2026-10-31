<?php
/**
 * Stays. A night is taken by a confirmed booking, by a request still within
 * its hold time, or by a block (owner or imported calendar). Placing or
 * confirming a booking locks the place's row and re-checks those nights, so
 * two guests can never get the same night. Prices: each night at its season
 * price, consecutive nights at the same price on one line, VAT rounded per
 * line as in Facturo. Times are Mauritius local time, written by the application.
 */
declare(strict_types=1);

namespace App\Bookora;

use App\ClientBloom\Customers;
use App\Database;
use App\Facturo\Clients;
use App\Facturo\Documents;
use App\Facturo\Money;
use App\Format;
use App\RendezVous\Booking;
use App\ShopLokal\Products;
use App\Suite\Tenant;

final class Bookings
{
    public const STATUSES = ['new' => 'À confirmer', 'confirmed' => 'Confirmée', 'cancelled' => 'Annulée', 'expired' => 'Expirée'];

    private const MAX_NIGHTS         = 60;
    private const IP_REQUESTS_PER_HOUR = 5;

    /**
     * Price of a stay, or why it cannot be booked (dates, length, guests, minimum stay).
     *
     * @param array<string,mixed>   $unit
     * @param array<string,string>  $t     Text::for()
     * @return array{0:?array{nights:int,lines:list<array{0:string,1:int,2:int,3:string,4:int,5:int}>,subtotal:int,tax:int,total:int},1:?string}
     */
    public static function quote(array $unit, string $in, string $out, int $guests, array $t, bool $owner = false): array
    {
        if (!Units::isDate($in) || !Units::isDate($out) || $out <= $in) {
            return [null, $t['err_dates']];
        }
        $today = Booking::now();
        if ($in < ($owner ? $today->modify('-60 days') : $today)->format('Y-m-d')) {
            return [null, $t['err_dates']];
        }
        if ($in > $today->modify('+18 months')->format('Y-m-d')) {
            return [null, $t['err_far']];
        }
        $nights = (int) (new \DateTimeImmutable($in))->diff(new \DateTimeImmutable($out))->days;
        if ($nights > self::MAX_NIGHTS) {
            return [null, $t['err_long']];
        }
        if (!$owner && $nights < (int) $unit['min_nights']) {
            return [null, sprintf($t['err_min'], (int) $unit['min_nights'])];
        }
        if ($guests < 1 || $guests > (int) $unit['capacity']) {
            return [null, sprintf($t['err_guests'], (int) $unit['capacity'])];
        }

        $code    = (string) $unit['tax_code'];
        $seasons = Units::seasons((int) $unit['id'], $code);
        $groups  = [];   // [first night, last night, price, label]
        for ($d = new \DateTimeImmutable($in); $d->format('Y-m-d') < $out; $d = $d->modify('+1 day')) {
            $day   = $d->format('Y-m-d');
            $price = (int) $unit['price_cents'];
            $label = '';
            foreach ($seasons as $s) {
                if ($s['start_date'] <= $day && $s['end_date'] >= $day) {
                    $price = $s['price_cents'];
                    $label = $s['label'];
                    break;
                }
            }
            $last = count($groups) - 1;
            if ($last >= 0 && $groups[$last][2] === $price && $groups[$last][3] === $label) {
                $groups[$last][1] = $day;
            } else {
                $groups[] = [$day, $day, $price, $label];
            }
        }
        $rate  = Products::rate($code);
        $lines = [];
        $sub = $tax = 0;
        foreach ($groups as [$first, $lastNight, $price, $label]) {
            $n = (int) (new \DateTimeImmutable($first))->diff(new \DateTimeImmutable($lastNight))->days + 1;
            [$lt, $lx] = Money::line($n * 1000, $price, $rate);
            $desc = sprintf($t['line'], $unit['name'], $n, Format::date($first), Format::date((new \DateTimeImmutable($lastNight))->modify('+1 day')->format('Y-m-d')))
                  . ($label !== '' ? sprintf($t['season'], $label) : '');
            $lines[] = [mb_substr($desc, 0, 200), $n, $price, $code, $lt, $lx];
            $sub += $lt;
            $tax += $lx;
        }
        return [['nights' => $nights, 'lines' => $lines, 'subtotal' => $sub, 'tax' => $tax, 'total' => $sub + $tax], null];
    }

    /**
     * What takes one of the nights in → out, or null when they are all free.
     */
    public static function conflict(int $unitId, string $in, string $out, int $exceptBookingId = 0): ?string
    {
        $pdo = Database::connection();
        $b = $pdo->prepare(
            'SELECT number FROM bookora_bookings WHERE unit_id = :u AND id <> :x AND check_in < :o AND check_out > :i
               AND (status = \'confirmed\' OR (status = \'new\' AND hold_until > :now)) LIMIT 1'
        );
        $b->execute([':u' => $unitId, ':x' => $exceptBookingId, ':o' => $out, ':i' => $in, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        if (($n = $b->fetchColumn()) !== false) {
            return 'réservation n° ' . $n;
        }
        $k = $pdo->prepare('SELECT source, reason FROM bookora_blocks WHERE unit_id = :u AND start_date < :o AND end_date > :i LIMIT 1');
        $k->execute([':u' => $unitId, ':o' => $out, ':i' => $in]);
        $blk = $k->fetch();
        if (is_array($blk)) {
            return $blk['source'] === 'ical' ? 'calendrier importé' . ($blk['reason'] !== null ? ' (' . $blk['reason'] . ')' : '') : 'fermeture' . ($blk['reason'] !== null ? ' (' . $blk['reason'] . ')' : '');
        }
        return null;
    }

    /**
     * Every open place for a stay: free with its price, or why not (taken,
     * too small, minimum stay). Date errors apply to all and come back alone.
     *
     * @param array<string,string> $t
     * @return array{0:list<array<string,mixed>>,1:?string}
     */
    public static function search(int $orgId, string $in, string $out, int $guests, array $t): array
    {
        $result = [];
        foreach (Units::all($orgId, true, false) as $u) {
            [$q, $err] = self::quote($u, $in, $out, $guests, $t);
            if ($q === null && in_array($err, [$t['err_dates'], $t['err_far'], $t['err_long']], true)) {
                return [[], $err];
            }
            if ($q === null || self::conflict((int) $u['id'], $in, $out) !== null) {
                $result[] = ['unit_id' => (int) $u['id'], 'available' => false, 'reason' => $q === null ? $err : $t['unavailable']];
                continue;
            }
            $result[] = ['unit_id' => (int) $u['id'], 'available' => true, 'nights' => $q['nights'], 'total' => $q['total'],
                         'lines' => array_map(static fn (array $l): array => ['text' => $l[0], 'amount' => $l[4] + $l[5]], $q['lines'])];
        }
        return [$result, null];
    }

    /**
     * Online request (dates held, to be confirmed) or a booking typed by the owner (confirmed at once).
     *
     * @param array<string,string|int> $in unit_id, check_in, check_out, guests, name, phone, email, note
     * @param array<string,string>     $t
     * @return array{0:?array<string,mixed>,1:?string}
     */
    public static function place(int $orgId, array $in, array $t, bool $owner, ?string $ip): array
    {
        $s     = Settings::get($orgId);
        $unit  = Units::find($orgId, (int) $in['unit_id']);
        $name  = trim(preg_replace('/\s+/u', ' ', (string) $in['name']) ?? '');
        $phone = Customers::normalizePhone((string) $in['phone']);
        $email = trim((string) $in['email']);
        $note  = mb_substr(trim((string) $in['note']), 0, 500);
        if ($unit === null || (!$owner && (int) $unit['active'] !== 1)) {
            return [null, $t['err_unit']];
        }
        [$q, $err] = self::quote($unit, (string) $in['check_in'], (string) $in['check_out'], (int) $in['guests'], $t, $owner);
        if ($q === null) {
            return [null, $err];
        }
        if ($name === '' || mb_strlen($name) > 120) {
            return [null, $t['err_name']];
        }
        if ($phone === null) {
            return [null, $t['err_phone']];
        }
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return [null, $t['err_email']];
        }
        $pdo = Database::connection();
        $now = Booking::now();
        if (!$owner) {
            $rate = $pdo->prepare('SELECT COUNT(*) FROM bookora_bookings WHERE created_ip = :ip AND created_at >= :since');
            $rate->execute([':ip' => (string) $ip, ':since' => $now->modify('-1 hour')->format('Y-m-d H:i:s')]);
            if ((int) $rate->fetchColumn() >= self::IP_REQUESTS_PER_HOUR) {
                return [null, $t['err_limit']];
            }
        }

        $pdo->beginTransaction();
        try {
            $num = $pdo->prepare('SELECT last_number FROM bookora_settings WHERE organization_id = :oid FOR UPDATE');
            $num->execute([':oid' => $orgId]);
            $number = (int) $num->fetchColumn() + 1;
            $pdo->prepare('SELECT id FROM bookora_units WHERE id = :u FOR UPDATE')->execute([':u' => (int) $unit['id']]);
            if (($c = self::conflict((int) $unit['id'], (string) $in['check_in'], (string) $in['check_out'])) !== null) {
                $pdo->rollBack();
                return [null, $owner ? 'Dates déjà prises : ' . $c . '.' : $t['err_taken']];
            }
            $pdo->prepare('UPDATE bookora_settings SET last_number = :n WHERE organization_id = :oid')->execute([':n' => $number, ':oid' => $orgId]);
            $at = $now->format('Y-m-d H:i:s');
            $pdo->prepare(
                'INSERT INTO bookora_bookings (organization_id, unit_id, number, guest_name, phone, email, guests, check_in, check_out, nights,
                                               subtotal_cents, tax_cents, total_cents, deposit_cents, status, source, note, hold_until, token,
                                               created_ip, created_at, updated_at)
                 VALUES (:oid, :u, :n, :name, :phone, :email, :g, :ci, :co, :nights, :sub, :tax, :total, :dep, :st, :src, :note, :hold, :tok, :ip, :at, :at2)'
            )->execute([
                ':oid' => $orgId, ':u' => (int) $unit['id'], ':n' => $number, ':name' => $name, ':phone' => $phone, ':email' => $email !== '' ? $email : null,
                ':g' => (int) $in['guests'], ':ci' => $in['check_in'], ':co' => $in['check_out'], ':nights' => $q['nights'],
                ':sub' => $q['subtotal'], ':tax' => $q['tax'], ':total' => $q['total'], ':dep' => (int) round($q['total'] * $s['deposit_percent'] / 100),
                ':st' => $owner ? 'confirmed' : 'new', ':src' => $owner ? 'manual' : 'online', ':note' => $note !== '' ? $note : null,
                ':hold' => $owner ? null : $now->modify('+' . $s['hold_hours'] . ' hours')->format('Y-m-d H:i:s'),
                ':tok' => bin2hex(random_bytes(24)), ':ip' => $owner ? null : $ip, ':at' => $at, ':at2' => $at,
            ]);
            $id  = (int) $pdo->lastInsertId();
            $ins = $pdo->prepare(
                'INSERT INTO bookora_booking_lines (booking_id, description, nights, unit_price_cents, tax_code, line_total_cents, line_tax_cents)
                 VALUES (:b, :d, :n, :u, :tc, :lt, :lx)'
            );
            foreach ($q['lines'] as [$desc, $n, $price, $code, $lt, $lx]) {
                $ins->execute([':b' => $id, ':d' => $desc, ':n' => $n, ':u' => $price, ':tc' => $code, ':lt' => $lt, ':lx' => $lx]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $b = self::find($orgId, $id);
        Notifier::safely(static fn () => $owner ? Notifier::confirmed($orgId, $b) : Notifier::requested($orgId, $b));
        return [$b, null];
    }

    /** New request → confirmed (re-checked when its hold has run out). */
    public static function confirm(int $orgId, int $id): ?string
    {
        $b = self::find($orgId, $id);
        if ($b === null) {
            return 'Réservation introuvable.';
        }
        if ($b['status'] !== 'new') {
            return 'Seule une demande à confirmer peut être confirmée.';
        }
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('SELECT id FROM bookora_units WHERE id = :u FOR UPDATE')->execute([':u' => (int) $b['unit_id']]);
            if (($c = self::conflict((int) $b['unit_id'], (string) $b['check_in'], (string) $b['check_out'], $id)) !== null) {
                $pdo->rollBack();
                return 'Ces dates ont été prises entre-temps (' . $c . ') : la demande ne peut plus être confirmée.';
            }
            $upd = $pdo->prepare('UPDATE bookora_bookings SET status = \'confirmed\', hold_until = NULL, updated_at = :now WHERE id = :id AND status = \'new\'');
            $upd->execute([':now' => Booking::now()->format('Y-m-d H:i:s'), ':id' => $id]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        Notifier::safely(static fn () => Notifier::confirmed($orgId, self::find($orgId, $id)));
        return null;
    }

    /**
     * The owner cancels a request or booking; the guest cancels a request not yet confirmed.
     */
    public static function cancel(int $orgId, int $id, bool $byGuest): ?string
    {
        $b = self::find($orgId, $id);
        if ($b === null) {
            return 'Réservation introuvable.';
        }
        $allowed = $byGuest ? ['new'] : ['new', 'confirmed'];
        if (!in_array($b['status'], $allowed, true)) {
            return 'Cette réservation ne peut pas être annulée.';
        }
        $upd = Database::connection()->prepare(
            'UPDATE bookora_bookings SET status = \'cancelled\', hold_until = NULL, updated_at = :now WHERE organization_id = :oid AND id = :id AND status = :old'
        );
        $upd->execute([':now' => Booking::now()->format('Y-m-d H:i:s'), ':oid' => $orgId, ':id' => $id, ':old' => $b['status']]);
        if ($upd->rowCount() !== 1) {
            return 'Cette réservation vient de changer. Rechargez la page.';
        }
        Notifier::safely(static fn () => Notifier::cancelled($orgId, self::find($orgId, $id), $byGuest));
        return null;
    }

    /** Deposit received / stay paid in full (or undone). */
    public static function setPayment(int $orgId, int $id, string $what, bool $on): ?string
    {
        $b = self::find($orgId, $id);
        if ($b === null) {
            return 'Réservation introuvable.';
        }
        if ($b['status'] === 'cancelled') {
            return 'Réservation annulée.';
        }
        $col = $what === 'paid' ? 'paid_at' : 'deposit_paid_at';
        $now = Booking::now()->format('Y-m-d H:i:s');
        Database::connection()->prepare("UPDATE bookora_bookings SET $col = :v, updated_at = :now WHERE organization_id = :oid AND id = :id")
            ->execute([':v' => $on ? $now : null, ':now' => $now, ':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * Draft Facturo invoice from the booking (one per booking).
     *
     * @return array{0:?int,1:?string}
     */
    public static function createInvoice(int $orgId, int $userId, int $id): array
    {
        $b = self::find($orgId, $id);
        if ($b === null) {
            return [null, 'Réservation introuvable.'];
        }
        if ($b['status'] !== 'confirmed') {
            return [null, 'Seule une réservation confirmée se facture.'];
        }
        if ($b['facturo_invoice_id'] !== null) {
            return [null, 'Une facture existe déjà pour cette réservation.'];
        }
        $clientId = Clients::matchOrCreate($orgId, (string) $b['guest_name'], $b['email'], (string) $b['phone']);
        $lines = [];
        foreach ($b['lines'] as $l) {
            $lines[] = ['description' => $l['description'], 'quantity' => (string) $l['nights'], 'unit_price' => Money::toInput((int) $l['unit_price_cents']),
                        'tax_code' => $l['tax_code'], 'nature' => 'SERVICES'];
        }
        [$draft, $error] = Documents::validate($orgId, [
            'type' => 'invoice', 'client_id' => $clientId, 'issue_date' => Booking::now()->format('Y-m-d'), 'due_date' => '',
            'currency' => 'MUR', 'notes' => 'Réservation n° ' . $b['number'] . ', ' . $b['guests'] . ' personne(s).', 'lines' => $lines,
        ]);
        if ($error !== null) {
            return [null, $error];
        }
        [$invoiceId, $error] = Documents::saveDraft($orgId, $userId, 0, $draft);
        if ($error !== null) {
            return [null, $error];
        }
        $set = Database::connection()->prepare(
            'UPDATE bookora_bookings SET facturo_invoice_id = :inv WHERE organization_id = :oid AND id = :id AND facturo_invoice_id IS NULL'
        );
        $set->execute([':inv' => $invoiceId, ':oid' => $orgId, ':id' => $id]);
        if ($set->rowCount() !== 1) {
            Documents::delete($orgId, $invoiceId);
            return [null, 'Une facture vient d\'être créée pour cette réservation. Rechargez la page.'];
        }
        return [$invoiceId, null];
    }

    /**
     * @return array<string,mixed>|null with lines, unit_name, invoice_number, state (status, or "expired")
     */
    public static function find(int $orgId, int $id): ?array
    {
        $rows = self::select('b.organization_id = :oid AND b.id = :id', [':oid' => $orgId, ':id' => $id]);
        if ($rows === []) {
            return null;
        }
        $b    = $rows[0];
        $stmt = Database::connection()->prepare('SELECT * FROM bookora_booking_lines WHERE booking_id = :b ORDER BY id');
        $stmt->execute([':b' => $id]);
        $b['lines'] = $stmt->fetchAll();
        return $b;
    }

    /**
     * @return array{0:int,1:array<string,mixed>}|null
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{48}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT organization_id, id FROM bookora_bookings WHERE token = :t');
        $stmt->execute([':t' => $token]);
        $r = $stmt->fetch();
        return $r ? [(int) $r['organization_id'], self::find((int) $r['organization_id'], (int) $r['id'])] : null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function list(int $orgId, string $filter): array
    {
        $today = Booking::now()->format('Y-m-d');
        $now   = Booking::now()->format('Y-m-d H:i:s');
        [$where, $order, $params] = match ($filter) {
            'todo'     => ['b.status = \'new\' AND b.hold_until > :now', 'b.check_in', [':now' => $now]],
            'upcoming' => ['b.status = \'confirmed\' AND b.check_out >= :d', 'b.check_in', [':d' => $today]],
            'past'     => ['b.status = \'confirmed\' AND b.check_out < :d', 'b.check_in DESC', [':d' => $today]],
            'closed'   => ['(b.status = \'cancelled\' OR (b.status = \'new\' AND b.hold_until <= :now))', 'b.id DESC', [':now' => $now]],
            default    => ['1 = 1', 'b.id DESC', []],
        };
        return self::select('b.organization_id = :oid AND ' . $where, [':oid' => $orgId] + $params, $order, 300);
    }

    /**
     * @return array<string,int> todo, upcoming, past, closed, all
     */
    public static function counts(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(CASE WHEN status = \'new\' AND hold_until > :n1 THEN 1 END) AS todo,
                    COUNT(CASE WHEN status = \'confirmed\' AND check_out >= :d1 THEN 1 END) AS upcoming,
                    COUNT(CASE WHEN status = \'confirmed\' AND check_out < :d2 THEN 1 END) AS past,
                    COUNT(CASE WHEN status = \'cancelled\' OR (status = \'new\' AND hold_until <= :n2) THEN 1 END) AS closed,
                    COUNT(*) AS all_
             FROM bookora_bookings WHERE organization_id = :oid'
        );
        $now = Booking::now();
        $stmt->execute([':oid' => $orgId, ':n1' => $now->format('Y-m-d H:i:s'), ':n2' => $now->format('Y-m-d H:i:s'),
                        ':d1' => $now->format('Y-m-d'), ':d2' => $now->format('Y-m-d')]);
        $r = array_map('intval', $stmt->fetch() ?: []);
        $r['all'] = $r['all_'];
        return $r;
    }

    /**
     * Arrivals and departures of confirmed stays on a day.
     *
     * @return array{arrivals:list<array<string,mixed>>,departures:list<array<string,mixed>>}
     */
    public static function movements(int $orgId, string $day): array
    {
        return [
            'arrivals'   => self::select('b.organization_id = :oid AND b.status = \'confirmed\' AND b.check_in = :d', [':oid' => $orgId, ':d' => $day], 'u.name'),
            'departures' => self::select('b.organization_id = :oid AND b.status = \'confirmed\' AND b.check_out = :d', [':oid' => $orgId, ':d' => $day], 'u.name'),
        ];
    }

    /**
     * Nights of a month per place: bookings (confirmed / held requests) and blocks.
     *
     * @return array<int,array<string,array{kind:string,label:string,id:?int}>> unit_id => date => cell
     */
    public static function calendar(int $orgId, string $monthStart): array
    {
        $first = new \DateTimeImmutable($monthStart);
        $next  = $first->modify('first day of next month')->format('Y-m-d');
        $from  = $first->format('Y-m-d');
        $pdo   = Database::connection();
        $out   = [];
        $fill  = static function (int $unit, string $s, string $e, array $cell) use (&$out, $from, $next): void {
            for ($d = new \DateTimeImmutable(max($s, $from)); $d->format('Y-m-d') < min($e, $next); $d = $d->modify('+1 day')) {
                $out[$unit][$d->format('Y-m-d')] ??= $cell;
            }
        };
        $b = $pdo->prepare(
            'SELECT b.id, b.unit_id, b.number, b.guest_name, b.status, b.check_in, b.check_out FROM bookora_bookings b
             WHERE b.organization_id = :oid AND b.check_in < :n AND b.check_out > :f AND (b.status = \'confirmed\' OR (b.status = \'new\' AND b.hold_until > :now))'
        );
        $b->execute([':oid' => $orgId, ':n' => $next, ':f' => $from, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        foreach ($b->fetchAll() as $r) {
            $fill((int) $r['unit_id'], (string) $r['check_in'], (string) $r['check_out'],
                ['kind' => $r['status'] === 'new' ? 'held' : 'booked', 'label' => '#' . $r['number'] . ' ' . $r['guest_name'], 'id' => (int) $r['id']]);
        }
        $k = $pdo->prepare(
            'SELECT k.unit_id, k.start_date, k.end_date, k.source, k.reason FROM bookora_blocks k JOIN bookora_units u ON u.id = k.unit_id
             WHERE u.organization_id = :oid AND k.start_date < :n AND k.end_date > :f'
        );
        $k->execute([':oid' => $orgId, ':n' => $next, ':f' => $from]);
        foreach ($k->fetchAll() as $r) {
            $fill((int) $r['unit_id'], (string) $r['start_date'], (string) $r['end_date'],
                ['kind' => $r['source'] === 'ical' ? 'ical' : 'block', 'label' => ($r['source'] === 'ical' ? 'Calendrier importé' : 'Fermé') . ($r['reason'] !== null ? ' : ' . $r['reason'] : ''), 'id' => null]);
        }
        return $out;
    }

    /**
     * Occupancy and revenue of confirmed stays for a month (nights inside the month).
     *
     * @return array{nights:int,available:int,revenue_cents:int,bookings:int}
     */
    public static function monthStats(int $orgId, string $from, string $to): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT b.check_in, b.check_out, b.nights, b.total_cents FROM bookora_bookings b
             WHERE b.organization_id = :oid AND b.status = \'confirmed\' AND b.check_in < :t AND b.check_out > :f'
        );
        $stmt->execute([':oid' => $orgId, ':t' => $to, ':f' => $from]);
        $nights = $revenue = $count = 0;
        foreach ($stmt->fetchAll() as $r) {
            $s = max((string) $r['check_in'], $from);
            $e = min((string) $r['check_out'], $to);
            $n = (int) (new \DateTimeImmutable($s))->diff(new \DateTimeImmutable($e))->days;
            $nights  += $n;
            $revenue += intdiv((int) $r['total_cents'] * $n, max(1, (int) $r['nights']));   // revenue of the nights in the month
            $count++;
        }
        $units = count(Units::all($orgId, true, false));
        $days  = (int) (new \DateTimeImmutable($from))->diff(new \DateTimeImmutable($to))->days;
        return ['nights' => $nights, 'available' => $units * $days, 'revenue_cents' => $revenue, 'bookings' => $count];
    }

    /** Status shown: a request whose hold ran out reads "expired". */
    public static function state(array $b): string
    {
        return $b['status'] === 'new' && $b['hold_until'] !== null && $b['hold_until'] <= Booking::now()->format('Y-m-d H:i:s') ? 'expired' : (string) $b['status'];
    }

    public static function language(int $orgId): string
    {
        return Tenant::profile($orgId)['document_language'];
    }

    /**
     * @param array<string,mixed> $params
     * @return list<array<string,mixed>>
     */
    private static function select(string $where, array $params, string $order = 'b.id', int $limit = 300): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT b.*, u.name AS unit_name, d.number AS invoice_number
             FROM bookora_bookings b JOIN bookora_units u ON u.id = b.unit_id LEFT JOIN facturo_documents d ON d.id = b.facturo_invoice_id
             WHERE ' . $where . ' ORDER BY ' . $order . ' LIMIT ' . $limit
        );
        $stmt->execute($params);
        return array_map(static function (array $b): array {
            $b['state'] = self::state($b);
            return $b;
        }, $stmt->fetchAll());
    }
}
