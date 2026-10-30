<?php
/**
 * Places to book (rooms, bungalows, villas), their seasonal prices and the
 * nights the owner closes. Prices are typed VAT included per night and
 * stored excl. VAT with an MRA tax code, like ShopLokal products.
 */
declare(strict_types=1);

namespace App\Bookora;

use App\Database;
use App\Facturo\Documents;
use App\Facturo\Money;
use App\RendezVous\Booking;
use App\ShopLokal\Products;
use App\Suite\Images;

final class Units
{
    /**
     * @return list<array<string,mixed>> with price_ttc_cents
     */
    public static function all(int $orgId, bool $activeOnly = false, bool $withImages = true): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, description, capacity, price_cents, tax_code, min_nights, active, ical_token, ical_import_url, ical_synced_at, ical_error, '
            . ($withImages ? 'image' : 'image IS NOT NULL AS has_image') . '
             FROM bookora_units WHERE organization_id = :oid' . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY active DESC, name'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map([self::class, 'withTtc'], $stmt->fetchAll());
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM bookora_units WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? self::withTtc($row) : null;
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function findByIcalToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{32}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT * FROM bookora_units WHERE ical_token = :t');
        $stmt->execute([':t' => $token]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<string,mixed> $in name, description, price (TTC per night), tax_code, capacity, min_nights, active,
     *                                image ("" keep, "remove", or a data URL)
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $id, array $in): array
    {
        $name  = trim((string) ($in['name'] ?? ''));
        $desc  = trim((string) ($in['description'] ?? ''));
        $ttc   = Money::parseCents(trim((string) ($in['price'] ?? '')));
        $code  = (string) ($in['tax_code'] ?? 'TC01');
        $cap   = trim((string) ($in['capacity'] ?? ''));
        $min   = trim((string) ($in['min_nights'] ?? '1'));
        $image = (string) ($in['image'] ?? '');
        if ($name === '' || mb_strlen($name) > 120) {
            return [0, 'Le nom du logement est obligatoire (120 caractères max.).'];
        }
        if (mb_strlen($desc) > 2000) {
            return [0, 'La description est trop longue (2000 caractères max.).'];
        }
        if ($ttc === null || $ttc <= 0) {
            return [0, 'Prix par nuit invalide.'];
        }
        if (!isset(Documents::TAX_CODES[$code])) {
            return [0, 'TVA invalide.'];
        }
        if (!ctype_digit($cap) || (int) $cap < 1 || (int) $cap > 50) {
            return [0, 'Capacité invalide (1 à 50 personnes).'];
        }
        if (!ctype_digit($min) || (int) $min < 1 || (int) $min > 30) {
            return [0, 'Durée minimale invalide (1 à 30 nuits).'];
        }
        if ($image !== '' && $image !== 'remove' && ($err = Images::check($image)) !== null) {
            return [0, $err];
        }
        $params = [
            ':n' => $name, ':d' => $desc !== '' ? $desc : null, ':p' => self::ht($ttc, $code), ':tc' => $code,
            ':c' => (int) $cap, ':m' => (int) $min, ':a' => ($in['active'] ?? false) === true ? 1 : 0, ':oid' => $orgId,
        ];
        $pdo = Database::connection();
        if ($id === 0) {
            $pdo->prepare(
                'INSERT INTO bookora_units (organization_id, name, description, capacity, price_cents, tax_code, min_nights, image, active, ical_token, created_at)
                 VALUES (:oid, :n, :d, :c, :p, :tc, :m, :img, :a, :tok, :now)'
            )->execute($params + [':img' => $image !== '' && $image !== 'remove' ? $image : null, ':tok' => bin2hex(random_bytes(16)),
                                  ':now' => Booking::now()->format('Y-m-d H:i:s')]);
            return [(int) $pdo->lastInsertId(), null];
        }
        if (self::find($orgId, $id) === null) {
            return [0, 'Logement introuvable.'];
        }
        $pdo->prepare(
            'UPDATE bookora_units SET name = :n, description = :d, capacity = :c, price_cents = :p, tax_code = :tc, min_nights = :m, active = :a'
            . ($image === '' ? '' : ', image = :img') . ' WHERE organization_id = :oid AND id = :id'
        )->execute($params + [':id' => $id] + ($image === '' ? [] : [':img' => $image === 'remove' ? null : $image]));
        return [$id, null];
    }

    /** Deleted when never booked; otherwise it must be deactivated (bookings keep their place). */
    public static function delete(int $orgId, int $id): ?string
    {
        if (self::find($orgId, $id) === null) {
            return 'Logement introuvable.';
        }
        $used = Database::connection()->prepare('SELECT COUNT(*) FROM bookora_bookings WHERE unit_id = :u');
        $used->execute([':u' => $id]);
        if ((int) $used->fetchColumn() > 0) {
            return 'Ce logement a des réservations : désactivez-le plutôt que de le supprimer.';
        }
        Database::connection()->prepare('DELETE FROM bookora_units WHERE organization_id = :oid AND id = :id')->execute([':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * @return list<array{id:int,label:string,start_date:string,end_date:string,price_cents:int,price_ttc_cents:int}>
     */
    public static function seasons(int $unitId, string $taxCode): array
    {
        $stmt = Database::connection()->prepare('SELECT id, label, start_date, end_date, price_cents FROM bookora_seasons WHERE unit_id = :u ORDER BY start_date');
        $stmt->execute([':u' => $unitId]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'label' => (string) $r['label'], 'start_date' => (string) $r['start_date'], 'end_date' => (string) $r['end_date'],
            'price_cents' => (int) $r['price_cents'], 'price_ttc_cents' => Products::ttc((int) $r['price_cents'], $taxCode),
        ], $stmt->fetchAll());
    }

    public static function addSeason(int $orgId, int $unitId, string $label, string $start, string $end, string $price): ?string
    {
        $u = self::find($orgId, $unitId);
        if ($u === null) {
            return 'Logement introuvable.';
        }
        $label = trim($label);
        $ttc   = Money::parseCents(trim($price));
        if ($label === '' || mb_strlen($label) > 60) {
            return 'Nom de la saison obligatoire (60 caractères max.).';
        }
        if (!self::isDate($start) || !self::isDate($end) || $end < $start) {
            return 'Dates de saison invalides (la dernière nuit après la première).';
        }
        if ($ttc === null || $ttc <= 0) {
            return 'Prix par nuit invalide.';
        }
        $pdo = Database::connection();
        $ov  = $pdo->prepare('SELECT label FROM bookora_seasons WHERE unit_id = :u AND start_date <= :e AND end_date >= :s LIMIT 1');
        $ov->execute([':u' => $unitId, ':e' => $end, ':s' => $start]);
        if (($other = $ov->fetchColumn()) !== false) {
            return 'Ces dates chevauchent la saison « ' . $other . ' ».';
        }
        $pdo->prepare('INSERT INTO bookora_seasons (unit_id, label, start_date, end_date, price_cents) VALUES (:u, :l, :s, :e, :p)')
            ->execute([':u' => $unitId, ':l' => $label, ':s' => $start, ':e' => $end, ':p' => self::ht($ttc, (string) $u['tax_code'])]);
        return null;
    }

    public static function deleteSeason(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare(
            'DELETE s FROM bookora_seasons s JOIN bookora_units u ON u.id = s.unit_id WHERE u.organization_id = :oid AND s.id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Saison introuvable.';
    }

    /**
     * Blocks ending after a date (closed nights), manual and imported.
     *
     * @return list<array<string,mixed>>
     */
    public static function blocks(int $unitId, string $from): array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM bookora_blocks WHERE unit_id = :u AND end_date > :f ORDER BY start_date');
        $stmt->execute([':u' => $unitId, ':f' => $from]);
        return $stmt->fetchAll();
    }

    /**
     * Close nights $start … $lastNight (inclusive), e.g. works or a booking taken elsewhere.
     */
    public static function addBlock(int $orgId, int $unitId, string $start, string $lastNight, string $reason): ?string
    {
        if (self::find($orgId, $unitId) === null) {
            return 'Logement introuvable.';
        }
        if (!self::isDate($start) || !self::isDate($lastNight) || $lastNight < $start) {
            return 'Dates invalides.';
        }
        $end = (new \DateTimeImmutable($lastNight))->modify('+1 day')->format('Y-m-d');
        if ((int) (new \DateTimeImmutable($start))->diff(new \DateTimeImmutable($end))->days > 366) {
            return 'Une fermeture couvre au plus un an.';
        }
        $reason = mb_substr(trim($reason), 0, 200);
        Database::connection()->prepare(
            'INSERT INTO bookora_blocks (unit_id, start_date, end_date, reason, source, created_at) VALUES (:u, :s, :e, :r, \'manual\', :now)'
        )->execute([':u' => $unitId, ':s' => $start, ':e' => $end, ':r' => $reason !== '' ? $reason : null, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        return null;
    }

    public static function deleteBlock(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare(
            'DELETE b FROM bookora_blocks b JOIN bookora_units u ON u.id = b.unit_id WHERE u.organization_id = :oid AND b.id = :id AND b.source = \'manual\''
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Fermeture introuvable (les dates importées se retirent sur la plateforme d\'origine).';
    }

    public static function setIcalUrl(int $orgId, int $unitId, string $url): ?string
    {
        if (self::find($orgId, $unitId) === null) {
            return 'Logement introuvable.';
        }
        $url = trim($url);
        if ($url !== '' && (strlen($url) > 500 || !filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url))) {
            return 'Adresse de calendrier invalide (copiez le lien iCal fourni par Airbnb ou Booking.com).';
        }
        $pdo = Database::connection();
        $pdo->prepare('UPDATE bookora_units SET ical_import_url = :u, ical_error = NULL WHERE organization_id = :oid AND id = :id')
            ->execute([':u' => $url !== '' ? $url : null, ':oid' => $orgId, ':id' => $unitId]);
        if ($url === '') {
            $pdo->prepare('DELETE FROM bookora_blocks WHERE unit_id = :u AND source = \'ical\'')->execute([':u' => $unitId]);
        }
        return null;
    }

    public static function newIcalToken(int $orgId, int $unitId): ?string
    {
        $stmt = Database::connection()->prepare('UPDATE bookora_units SET ical_token = :t WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':t' => bin2hex(random_bytes(16)), ':oid' => $orgId, ':id' => $unitId]);
        return $stmt->rowCount() === 1 ? null : 'Logement introuvable.';
    }

    /** Price per night excl. VAT from the price typed VAT included. */
    public static function ht(int $ttc, string $code): int
    {
        $rate = Products::rate($code);
        return (int) round($ttc * 10000 / (10000 + $rate));
    }

    public static function isDate(string $value): bool
    {
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $d !== false && $d->format('Y-m-d') === $value;
    }

    /**
     * @param array<string,mixed> $u
     * @return array<string,mixed>
     */
    private static function withTtc(array $u): array
    {
        $u['price_ttc_cents'] = Products::ttc((int) $u['price_cents'], (string) $u['tax_code']);
        return $u;
    }
}
