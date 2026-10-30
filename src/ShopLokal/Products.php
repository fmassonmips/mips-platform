<?php
/**
 * Shop products. Prices are entered VAT included, as customers see them, and
 * stored excl. VAT with an MRA tax code; the displayed price is recomputed
 * from that (it can differ by Rs 0.01 from what was typed), so an order and
 * its Facturo invoice always total the same.
 */
declare(strict_types=1);

namespace App\ShopLokal;

use App\Database;
use App\Facturo\Documents;
use App\Facturo\Money;
use App\RendezVous\Booking;
use App\Suite\Images;

final class Products
{
    /**
     * @return list<array<string,mixed>> with price_ttc_cents
     */
    public static function all(int $orgId, bool $activeOnly = false, bool $withImages = true): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, description, price_cents, tax_code, stock, active, ' . ($withImages ? 'image' : 'image IS NOT NULL AS has_image') . '
             FROM shoplokal_products WHERE organization_id = :oid' . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY active DESC, name'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map([self::class, 'withTtc'], $stmt->fetchAll());
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM shoplokal_products WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? self::withTtc($row) : null;
    }

    public static function rate(string $taxCode): int
    {
        return Documents::TAX_CODES[$taxCode]['rate_bp'] ?? 0;
    }

    /** Excl.-VAT unit price → price shown to customers. */
    public static function ttc(int $priceCents, string $taxCode): int
    {
        [$ht, $tax] = Money::line(1000, $priceCents, self::rate($taxCode));
        return $ht + $tax;
    }

    /**
     * @param array<string,mixed> $in name, description, price (VAT incl., "850.00"), tax_code, stock ("" = untracked),
     *                                active, image ("" keep, "remove", or a data URL)
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $id, array $in): array
    {
        $name    = trim((string) ($in['name'] ?? ''));
        $desc    = trim((string) ($in['description'] ?? ''));
        $ttc     = Money::parseCents(trim((string) ($in['price'] ?? '')));
        $code    = (string) ($in['tax_code'] ?? 'TC03');
        $stockIn = trim((string) ($in['stock'] ?? ''));
        $image   = (string) ($in['image'] ?? '');
        if ($name === '' || mb_strlen($name) > 150) {
            return [0, 'Le nom du produit est obligatoire (150 caractères max.).'];
        }
        if (mb_strlen($desc) > 2000) {
            return [0, 'La description est trop longue (2000 caractères max.).'];
        }
        if ($ttc === null || $ttc <= 0) {
            return [0, 'Prix invalide.'];
        }
        if (!isset(Documents::TAX_CODES[$code])) {
            return [0, 'TVA invalide.'];
        }
        if ($stockIn !== '' && !preg_match('/^\d{1,7}$/', $stockIn)) {
            return [0, 'Stock invalide (nombre entier, vide = non suivi).'];
        }
        $imageSql = null;
        if ($image !== '' && $image !== 'remove') {
            if (($err = Images::check($image)) !== null) {
                return [0, $err];
            }
            $imageSql = $image;
        }
        $rate = self::rate($code);
        $ht   = (int) round($ttc * 10000 / (10000 + $rate));
        $params = [
            ':oid' => $orgId, ':n' => $name, ':d' => $desc !== '' ? $desc : null, ':p' => $ht, ':tc' => $code,
            ':s' => $stockIn !== '' ? (int) $stockIn : null, ':a' => ($in['active'] ?? false) === true ? 1 : 0,
        ];
        $pdo = Database::connection();
        if ($id === 0) {
            $pdo->prepare(
                'INSERT INTO shoplokal_products (organization_id, name, description, price_cents, tax_code, stock, image, active, created_at)
                 VALUES (:oid, :n, :d, :p, :tc, :s, :img, :a, :now)'
            )->execute($params + [':img' => $imageSql, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
            return [(int) $pdo->lastInsertId(), null];
        }
        if (self::find($orgId, $id) === null) {
            return [0, 'Produit introuvable.'];
        }
        $pdo->prepare(
            'UPDATE shoplokal_products SET name = :n, description = :d, price_cents = :p, tax_code = :tc, stock = :s, active = :a'
            . ($image === '' ? '' : ', image = :img') . ' WHERE organization_id = :oid AND id = :id'
        )->execute($params + [':id' => $id] + ($image === '' ? [] : [':img' => $imageSql]));
        return [$id, null];
    }

    /**
     * @return list<array{id:int,name:string,stock:int}> active products with 3 or fewer left
     */
    public static function lowStock(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, stock FROM shoplokal_products WHERE organization_id = :oid AND active = 1 AND stock IS NOT NULL AND stock <= 3 ORDER BY stock, name'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map(static fn (array $r): array => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'stock' => (int) $r['stock']], $stmt->fetchAll());
    }

    /**
     * @param array<string,mixed> $p
     * @return array<string,mixed>
     */
    private static function withTtc(array $p): array
    {
        $p['price_ttc_cents'] = self::ttc((int) $p['price_cents'], (string) $p['tax_code']);
        return $p;
    }
}
