<?php
/**
 * Catalogue of a company's usual products and services. Picking an item in the
 * draft editor fills a new line (description, price excl. tax, VAT treatment,
 * nature); the line is then validated like any other, and changing the item
 * later never touches documents already written.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;

final class Items
{
    public const MAX_ITEMS = 500;

    /** @return list<array{id:int,name:string,unit_price_cents:int,tax_code:string,nature:string}> */
    public static function all(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, unit_price_cents, tax_code, nature FROM facturo_items WHERE organization_id = :o ORDER BY name'
        );
        $stmt->execute([':o' => $orgId]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'name' => (string) $r['name'], 'unit_price_cents' => (int) $r['unit_price_cents'],
            'tax_code' => (string) $r['tax_code'], 'nature' => (string) $r['nature'],
        ], $stmt->fetchAll());
    }

    /**
     * @param array{name:string,unit_price:string,tax_code:string,nature:string} $input
     * @return array{0:?array<string,mixed>,1:?string} [clean fields, error]
     */
    public static function validate(array $input): array
    {
        $name = trim(preg_replace('/\s+/u', ' ', $input['name']) ?? '');
        if ($name === '' || mb_strlen($name) > 200) {
            return [null, 'Indiquez le libellé de l\'article (200 caractères au plus).'];
        }
        $cents = Money::parseCents($input['unit_price']);
        if ($cents === null || $cents < 0 || $cents > 99_999_999_999) {
            return [null, 'Prix unitaire HT invalide (ex. 1500 ou 1500.50).'];
        }
        if (!isset(Documents::TAX_CODES[$input['tax_code']])) {
            return [null, 'Traitement TVA invalide.'];
        }
        if (!isset(Documents::NATURES[$input['nature']])) {
            return [null, 'Indiquez s\'il s\'agit d\'un bien ou d\'un service.'];
        }
        return [['name' => $name, 'unit_price_cents' => $cents, 'tax_code' => $input['tax_code'], 'nature' => $input['nature']], null];
    }

    /**
     * @param array<string,mixed> $f validated fields
     * @return array{0:?int,1:?string} [id, error]
     */
    public static function save(int $orgId, int $id, array $f): array
    {
        $pdo = Database::connection();
        $dup = $pdo->prepare('SELECT id FROM facturo_items WHERE organization_id = :o AND name = :n AND id <> :id');
        $dup->execute([':o' => $orgId, ':n' => $f['name'], ':id' => $id]);
        if ($dup->fetchColumn() !== false) {
            return [null, 'Un article porte déjà ce libellé.'];
        }
        $params = [':o' => $orgId, ':n' => $f['name'], ':p' => $f['unit_price_cents'], ':t' => $f['tax_code'], ':na' => $f['nature']];
        if ($id > 0) {
            $stmt = $pdo->prepare('UPDATE facturo_items SET name = :n, unit_price_cents = :p, tax_code = :t, nature = :na WHERE organization_id = :o AND id = :id');
            $stmt->execute($params + [':id' => $id]);
            $found = $pdo->prepare('SELECT 1 FROM facturo_items WHERE organization_id = :o AND id = :id');
            $found->execute([':o' => $orgId, ':id' => $id]);
            return $found->fetchColumn() !== false ? [$id, null] : [null, 'Article introuvable.'];
        }
        $count = $pdo->prepare('SELECT COUNT(*) FROM facturo_items WHERE organization_id = :o');
        $count->execute([':o' => $orgId]);
        if ((int) $count->fetchColumn() >= self::MAX_ITEMS) {
            return [null, 'Le catalogue est limité à ' . self::MAX_ITEMS . ' articles.'];
        }
        try {
            $pdo->prepare('INSERT INTO facturo_items (organization_id, name, unit_price_cents, tax_code, nature) VALUES (:o, :n, :p, :t, :na)')->execute($params);
        } catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') {   // two saves of the same name at once
                return [null, 'Un article porte déjà ce libellé.'];
            }
            throw $e;
        }
        return [(int) $pdo->lastInsertId(), null];
    }

    public static function delete(int $orgId, int $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM facturo_items WHERE organization_id = :o AND id = :id');
        $stmt->execute([':o' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1;
    }
}
