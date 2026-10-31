<?php
/**
 * Import of existing lists from Excel (CSV): Facturo clients, ClientBloom
 * customers, ShopLokal products.
 *
 * The file comes as CSV saved by Excel or Google Sheets: UTF-8 (with or
 * without BOM) or Windows-1252, separated by ";", "," or tabs. The first row
 * holds the column names, matched to our fields by usual names (French and
 * English), the user can correct the matching. A preview checks every row
 * without saving; the import then saves the valid rows in one transaction and
 * reports the others with their line number. Rows already present (same
 * e-mail, phone or product name), in the file or in the app, are skipped.
 */
declare(strict_types=1);

namespace App\Suite;

use App\ClientBloom\Customers;
use App\Database;
use App\Facturo\Clients;
use App\Facturo\Money;
use App\ShopLokal\Products;

final class Import
{
    public const MAX_BYTES = 1_000_000;
    public const MAX_ROWS  = 2000;

    /**
     * Each type: app, title, fields (key => [label, required, header synonyms]), example row.
     */
    public const TYPES = [
        'clients' => [
            'app' => 'facturo', 'title' => 'Clients Facturo', 'back' => '/app.php?m=facturo&p=clients',
            'fields' => [
                'name'       => ['Nom / société', true,  ['nom', 'name', 'client', 'societe', 'raison sociale', 'entreprise', 'company', 'customer']],
                'email'      => ['E-mail', false,        ['email', 'e-mail', 'mail', 'courriel', 'adresse email']],
                'phone'      => ['Téléphone', false,     ['telephone', 'tel', 'phone', 'mobile', 'portable', 'gsm', 'contact']],
                'address'    => ['Adresse', false,       ['adresse', 'address', 'adresse postale', 'ville']],
                'brn'        => ['BRN', false,           ['brn', 'business registration number', 'n brn']],
                'vat_number' => ['N° TVA', false,        ['tva', 'vat', 'numero tva', 'n tva', 'vat number', 'vat no']],
            ],
            'example' => ['Hôtel Le Lagon', 'compta@lagon.mu', '230 5712 3456', 'Royal Road, Grand Baie', 'C07012345', 'VAT27012345'],
        ],
        'customers' => [
            'app' => 'clientbloom', 'title' => 'Clients fidélité ClientBloom', 'back' => '/app.php?m=clientbloom&p=customers',
            'fields' => [
                'name'              => ['Nom', true,                 ['nom', 'name', 'client', 'prenom nom', 'nom complet', 'customer']],
                'phone'             => ['Téléphone', false,          ['telephone', 'tel', 'phone', 'mobile', 'portable', 'gsm', 'whatsapp']],
                'email'             => ['E-mail', false,             ['email', 'e-mail', 'mail', 'courriel']],
                'birthday'          => ['Anniversaire', false,       ['anniversaire', 'date de naissance', 'naissance', 'birthday', 'birth date', 'dob']],
                'tags'              => ['Étiquettes', false,         ['etiquettes', 'tags', 'tag', 'categorie', 'groupe']],
                'marketing_consent' => ['Accepte les offres', false, ['consentement', 'offres', 'marketing', 'newsletter', 'opt-in', 'optin', 'consent']],
            ],
            'example' => ['Priya Ramdin', '5712 3456', 'priya@example.mu', '14/02/1990', 'VIP', 'oui'],
        ],
        'products' => [
            'app' => 'shoplokal', 'title' => 'Produits ShopLokal', 'back' => '/app.php?m=shoplokal&p=products',
            'fields' => [
                'name'        => ['Produit', true,           ['produit', 'nom', 'name', 'article', 'designation', 'product', 'libelle']],
                'price'       => ['Prix TTC (Rs)', true,     ['prix', 'prix ttc', 'price', 'prix de vente', 'tarif', 'pu', 'prix unitaire']],
                'tax'         => ['TVA', false,              ['tva', 'vat', 'taxe', 'tax']],
                'stock'       => ['Stock', false,            ['stock', 'quantite', 'qte', 'qty', 'quantity', 'inventaire']],
                'description' => ['Description', false,      ['description', 'details', 'detail', 'commentaire']],
            ],
            'example' => ['Savon artisanal vanille', '250,00', '15 %', '40', 'Fabriqué à Curepipe'],
        ],
    ];

    /**
     * Read the uploaded file. Returns [header, rows, error].
     *
     * @return array{0:list<string>,1:list<list<string>>,2:?string}
     */
    public static function parse(string $base64): array
    {
        $raw = base64_decode($base64, true);
        if ($raw === false || $raw === '') {
            return [[], [], 'Fichier vide ou illisible.'];
        }
        if (strlen($raw) > self::MAX_BYTES) {
            return [[], [], 'Fichier trop gros (1 Mo au plus, soit environ ' . self::MAX_ROWS . ' lignes).'];
        }
        if (str_starts_with($raw, "PK\x03\x04") || str_starts_with($raw, "\xD0\xCF\x11\xE0")) {
            return [[], [], 'C’est un fichier Excel (.xlsx / .xls) : dans Excel, faites « Enregistrer sous » → « CSV UTF-8 », puis importez ce fichier.'];
        }
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw) ?? $raw;
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');   // Excel « CSV (séparateur : point-virgule) » on Windows
        }
        $first = strtok($raw, "\r\n") ?: '';
        $delimiter = ';';
        $best = -1;
        foreach ([';', ',', "\t"] as $d) {
            if (substr_count($first, $d) > $best) {
                $best      = substr_count($first, $d);
                $delimiter = $d;
            }
        }

        $fh = fopen('php://temp', 'r+');
        fwrite($fh, $raw);
        rewind($fh);
        $header = null;
        $rows   = [];
        while (($cells = fgetcsv($fh, 0, $delimiter, '"', '')) !== false) {
            $cells = array_map(static fn ($c): string => trim((string) $c), $cells);
            if (implode('', $cells) === '') {
                continue;   // blank line
            }
            if ($header === null) {
                $header = $cells;
                continue;
            }
            if (count($rows) >= self::MAX_ROWS) {
                fclose($fh);
                return [[], [], 'Plus de ' . self::MAX_ROWS . ' lignes : coupez le fichier en plusieurs parties.'];
            }
            $rows[] = $cells;
        }
        fclose($fh);
        if ($header === null || $rows === []) {
            return [[], [], 'Aucune ligne à importer : la première ligne doit contenir les noms de colonnes, les suivantes les données.'];
        }
        return [$header, $rows, null];
    }

    /**
     * Column guessed for each field from the header names (-1 = none).
     *
     * @param list<string> $header
     * @return array<string,int>
     */
    public static function guessMapping(string $type, array $header): array
    {
        $norm = array_map([self::class, 'normalizeHeader'], $header);
        $mapping = [];
        $taken = [];
        foreach (self::TYPES[$type]['fields'] as $field => [, , $synonyms]) {
            $mapping[$field] = -1;
            foreach ($synonyms as $syn) {
                $i = array_search($syn, $norm, true);
                if ($i !== false && !isset($taken[$i])) {
                    $mapping[$field] = (int) $i;
                    $taken[$i] = true;
                    break;
                }
            }
        }
        return $mapping;
    }

    /**
     * Check (dry run) or import the rows. Returns the outcome of every row.
     *
     * @param list<list<string>> $rows
     * @param array<string,int> $mapping field => column index (-1 = not imported)
     * @return array{0:?array{created:int,duplicates:int,errors:list<array{line:int,message:string}>,sample:list<array<string,string>>},1:?string}
     */
    public static function run(string $type, int $orgId, int $userId, array $rows, array $mapping, bool $save): array
    {
        $def = self::TYPES[$type];
        foreach ($def['fields'] as $field => [$label, $required]) {
            $col = $mapping[$field] ?? -1;
            if ($required && $col < 0) {
                return [null, 'Choisissez la colonne « ' . $label . ' ».'];
            }
        }
        $seen = self::existing($type, $orgId);
        $out  = ['created' => 0, 'duplicates' => 0, 'errors' => [], 'sample' => []];
        $pdo  = Database::connection();
        if ($save) {
            $pdo->beginTransaction();
        }
        try {
            foreach ($rows as $i => $cells) {
                $line = $i + 2;   // line 1 = column names
                $in = [];
                foreach ($def['fields'] as $field => $_) {
                    $col = $mapping[$field] ?? -1;
                    $in[$field] = $col >= 0 ? (string) ($cells[$col] ?? '') : '';
                }
                if (count($out['sample']) < 5) {
                    $out['sample'][] = $in;
                }
                [$keys, $error] = self::check($type, $in);
                if ($error !== null) {
                    $out['errors'][] = ['line' => $line, 'message' => $error];
                    continue;
                }
                if (array_intersect($keys, array_keys($seen)) !== []) {
                    $out['duplicates']++;
                    continue;
                }
                foreach ($keys as $k) {
                    $seen[$k] = true;
                }
                if ($save && ($err = self::save($type, $orgId, $userId, $in)) !== null) {
                    $out['errors'][] = ['line' => $line, 'message' => $err];
                    continue;
                }
                $out['created']++;
            }
            if ($save) {
                $pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return [$out, null];
    }

    /** CSV model for Excel (UTF-8 with BOM, ";" separated): column names and one example row. */
    public static function template(string $type): string
    {
        $def = self::TYPES[$type];
        $line = static fn (array $cells): string => implode(';', array_map(
            static fn (string $c): string => '"' . str_replace('"', '""', $c) . '"', $cells
        )) . "\r\n";
        return "\xEF\xBB\xBF" . $line(array_map(static fn (array $f): string => $f[0], array_values($def['fields']))) . $line($def['example']);
    }

    /**
     * Validate one row the way the app does; returns its duplicate keys.
     *
     * @param array<string,string> $in
     * @return array{0:list<string>,1:?string}
     */
    private static function check(string $type, array $in): array
    {
        switch ($type) {
            case 'clients':
                [$c, $err] = Clients::validate($in);
                if ($err !== null) {
                    return [[], $err];
                }
                $keys = $c['email'] !== null ? ['e:' . mb_strtolower($c['email'])] : ['n:' . mb_strtolower($c['name']) . '|' . preg_replace('/\D+/', '', (string) $c['phone'])];
                return [$keys, null];
            case 'customers':
                [$c, $err] = Customers::validate(self::customerInput($in));
                if ($err !== null) {
                    return [[], $err];
                }
                $keys = [];
                if ($c['phone'] !== null) {
                    $keys[] = 'p:' . $c['phone'];
                }
                if ($c['email'] !== null) {
                    $keys[] = 'e:' . mb_strtolower($c['email']);
                }
                return [$keys, null];
            default:
                $p = self::productInput($in);
                if (is_string($p)) {
                    return [[], $p];
                }
                if ($p['name'] === '' || mb_strlen($p['name']) > 150) {
                    return [[], 'Le nom du produit est obligatoire (150 caractères max.).'];
                }
                if (($cents = Money::parseCents($p['price'])) === null || $cents <= 0) {
                    return [[], 'Prix invalide : « ' . $in['price'] . ' ».'];
                }
                if ($p['stock'] !== '' && !preg_match('/^\d{1,7}$/', $p['stock'])) {
                    return [[], 'Stock invalide : « ' . $in['stock'] . ' » (nombre entier, vide = non suivi).'];
                }
                if (mb_strlen($p['description']) > 2000) {
                    return [[], 'Description trop longue (2000 caractères max.).'];
                }
                return [['n:' . mb_strtolower($p['name'])], null];
        }
    }

    /**
     * @param array<string,string> $in validated by check()
     */
    private static function save(string $type, int $orgId, int $userId, array $in): ?string
    {
        switch ($type) {
            case 'clients':
                [$c] = Clients::validate($in);
                Clients::save($orgId, 0, $c);
                return null;
            case 'customers':
                [$c] = Customers::validate(self::customerInput($in));
                return Customers::save($orgId, $userId, 0, $c, false)[1];   // no welcome bonus on imported customers
            default:
                /** @var array<string,mixed> $p */
                $p = self::productInput($in);
                return Products::save($orgId, 0, $p)[1];
        }
    }

    /**
     * @param array<string,string> $in
     * @return array<string,mixed>
     */
    private static function customerInput(array $in): array
    {
        $birthday = trim($in['birthday']);
        if (preg_match('#^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$#', $birthday, $m)) {
            $birthday = sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);   // 14/02/1990 (day first, as in Mauritius)
        }
        $consent = self::normalizeHeader($in['marketing_consent']);
        return [
            'name' => $in['name'], 'phone' => $in['phone'], 'email' => $in['email'], 'birthday' => $birthday, 'tags' => $in['tags'],
            'marketing_consent' => in_array($consent, ['oui', 'yes', 'o', 'y', '1', 'x', 'vrai', 'true'], true),
        ];
    }

    /**
     * @param array<string,string> $in
     * @return array<string,mixed>|string product input for Products::save, or an error
     */
    private static function productInput(array $in): array|string
    {
        $tax = self::normalizeHeader($in['tax']);
        $code = match (true) {
            $tax === ''                                                => 'TC01',
            in_array($tax, ['15', '15 %', '15%', 'tc01', 'oui'], true) => 'TC01',
            in_array($tax, ['0', '0 %', '0%', 'tc02', 'taux zero'], true) => 'TC02',
            in_array($tax, ['exonere', 'exempt', 'sans tva', 'non', 'tc03'], true) => 'TC03',
            default => null,
        };
        if ($code === null) {
            return 'TVA non reconnue : « ' . $in['tax'] . ' » (15 %, 0 % ou exonéré).';
        }
        return [
            'name' => trim($in['name']), 'description' => trim($in['description']), 'price' => self::normalizePrice($in['price']),
            'tax_code' => $code, 'stock' => trim($in['stock']), 'active' => true, 'image' => '',
        ];
    }

    /** "Rs 1 250,00", "1,250.00", "1250" → "1250.00"-style for Money::parseCents. */
    private static function normalizePrice(string $raw): string
    {
        $v = preg_replace('/(rs\.?|mur|\s|\x{00A0}|\x{202F})/iu', '', $raw) ?? '';
        if (preg_match('/^\d{1,3}(,\d{3})+$/', $v)) {
            return str_replace(',', '', $v);               // 1,250 (thousands comma, as Excel shows it in Mauritius)
        }
        if (preg_match('/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/', $v) || (str_contains($v, ',') && !str_contains($v, '.'))) {
            $v = str_replace(['.', ','], ['', '.'], $v);   // 1.250,00 or 250,50 (decimal comma)
        } else {
            $v = str_replace(',', '', $v);                 // 1,250.00 (thousands comma)
        }
        return $v;
    }

    /** Lowercase, no accents or punctuation: "Téléphone " → "telephone", "N° TVA" → "n tva". */
    private static function normalizeHeader(string $s): string
    {
        $s = mb_strtolower(trim($s));
        $s = strtr($s, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ù' => 'u', 'û' => 'u', 'ç' => 'c', '°' => ' ', 'º' => ' ']);
        $s = preg_replace('/[^a-z0-9%@ -]+/', ' ', $s) ?? '';
        return trim(preg_replace('/\s+/', ' ', $s) ?? '');
    }

    /**
     * Duplicate keys of what the app already holds.
     *
     * @return array<string,true>
     */
    private static function existing(string $type, int $orgId): array
    {
        $pdo  = Database::connection();
        $keys = [];
        if ($type === 'clients') {
            $stmt = $pdo->prepare('SELECT email, name, phone FROM facturo_clients WHERE organization_id = :o');
            $stmt->execute([':o' => $orgId]);
            foreach ($stmt->fetchAll() as $r) {
                $keys[$r['email'] !== null && $r['email'] !== '' ? 'e:' . mb_strtolower((string) $r['email'])
                    : 'n:' . mb_strtolower((string) $r['name']) . '|' . preg_replace('/\D+/', '', (string) $r['phone'])] = true;
            }
        } elseif ($type === 'customers') {
            $stmt = $pdo->prepare('SELECT phone, email FROM clientbloom_customers WHERE organization_id = :o AND erased_at IS NULL');
            $stmt->execute([':o' => $orgId]);
            foreach ($stmt->fetchAll() as $r) {
                if ($r['phone'] !== null) {
                    $keys['p:' . $r['phone']] = true;
                }
                if ($r['email'] !== null) {
                    $keys['e:' . mb_strtolower((string) $r['email'])] = true;
                }
            }
        } else {
            $stmt = $pdo->prepare('SELECT name FROM shoplokal_products WHERE organization_id = :o');
            $stmt->execute([':o' => $orgId]);
            foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $n) {
                $keys['n:' . mb_strtolower((string) $n)] = true;
            }
        }
        return $keys;
    }
}
