<?php
/**
 * ClientBloom customers (CRM), always scoped to one organization.
 * Phones are the counter identifier: stored as local digits (+230 dropped).
 */
declare(strict_types=1);

namespace App\ClientBloom;

use App\Database;

final class Customers
{
    /** Segments offered in the customer list. */
    public const SEGMENTS = [
        'all'       => 'Tous',
        'balance'   => 'Avec cashback',
        'inactive'  => 'Inactifs depuis 60 jours ou plus',
        'top'       => 'Meilleurs clients',
        'birthdays' => 'Anniversaires du mois',
        'consent'   => 'Consentement marketing',
    ];

    private const COLUMNS = 'id, name, phone, email, birthday, tags, marketing_consent, consent_at, balance_cents,
                             total_spent_cents, visits, last_visit_at, last_activity_at, erased_at, created_at';

    /** "+230 5 712-3456" → "57123456"; null when not a plausible number. */
    public static function normalizePhone(string $raw): ?string
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if (str_starts_with($digits, '230') && strlen($digits) >= 10) {
            $digits = substr($digits, 3);
        }
        return strlen($digits) >= 7 && strlen($digits) <= 15 ? $digits : null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function search(int $orgId, string $segment, string $query, int $limit = 200): array
    {
        $where  = ['organization_id = :oid', 'erased_at IS NULL'];
        $params = [':oid' => $orgId];
        $order  = 'name';

        switch ($segment) {
            case 'balance':
                $where[] = 'balance_cents > 0';
                $order   = 'balance_cents DESC';
                break;
            case 'inactive':
                $where[] = '(last_visit_at IS NULL OR last_visit_at < DATE_SUB(NOW(), INTERVAL 60 DAY))';
                $order   = 'last_visit_at';
                break;
            case 'top':
                $where[] = 'total_spent_cents > 0';
                $order   = 'total_spent_cents DESC';
                break;
            case 'birthdays':
                $where[] = 'MONTH(birthday) = MONTH(CURDATE())';
                $order   = 'DAY(birthday)';
                break;
            case 'consent':
                $where[] = 'marketing_consent = 1';
                break;
        }

        $query = trim($query);
        if ($query !== '') {
            // Any 3+ digits also search phone numbers (partial match).
            $digits = preg_replace('/\D+/', '', $query) ?? '';
            $phone  = strlen($digits) >= 3 ? (self::normalizePhone($digits) ?? $digits) : null;
            $where[] = '(name LIKE :q1 OR email LIKE :q2' . ($phone !== null ? ' OR phone LIKE :p' : '') . ')';
            $params[':q1'] = $params[':q2'] = '%' . addcslashes($query, '%_\\') . '%';
            if ($phone !== null) {
                $params[':p'] = '%' . $phone . '%';
            }
        }

        $stmt = Database::connection()->prepare(
            'SELECT ' . self::COLUMNS . ' FROM clientbloom_customers WHERE ' . implode(' AND ', $where)
            . ' ORDER BY ' . $order . ' LIMIT ' . max(1, min($limit, 10000))
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT ' . self::COLUMNS . ' FROM clientbloom_customers WHERE organization_id = :oid AND id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function findByPhone(int $orgId, string $phone): ?array
    {
        $normalized = self::normalizePhone($phone);
        if ($normalized === null) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT ' . self::COLUMNS . ' FROM clientbloom_customers
             WHERE organization_id = :oid AND phone = :phone AND erased_at IS NULL'
        );
        $stmt->execute([':oid' => $orgId, ':phone' => $normalized]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function findByEmail(int $orgId, string $email): ?array
    {
        $email = trim($email);
        if ($email === '') {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT ' . self::COLUMNS . ' FROM clientbloom_customers
             WHERE organization_id = :oid AND email = :email AND erased_at IS NULL ORDER BY id LIMIT 1'
        );
        $stmt->execute([':oid' => $orgId, ':email' => $email]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Validate raw input. Returns [clean fields, error|null].
     *
     * @param array<string,mixed> $in
     * @return array{0:array<string,mixed>,1:?string}
     */
    public static function validate(array $in): array
    {
        $str = static fn (string $k): string => is_string($in[$k] ?? null) ? trim($in[$k]) : '';

        $name = $str('name');
        if ($name === '' || mb_strlen($name) > 120) {
            return [[], 'Le nom est obligatoire (120 caractères max.).'];
        }
        $phoneRaw = $str('phone');
        $phone    = $phoneRaw === '' ? null : self::normalizePhone($phoneRaw);
        if ($phoneRaw !== '' && $phone === null) {
            return [[], 'Numéro de téléphone invalide.'];
        }
        $email = $str('email');
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return [[], 'Adresse e-mail invalide.'];
        }
        $birthday = $str('birthday');
        if ($birthday !== '') {
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $birthday);
            if ($d === false || $d->format('Y-m-d') !== $birthday || $birthday > date('Y-m-d')) {
                return [[], 'Date d\'anniversaire invalide.'];
            }
        }
        $tags = implode(', ', array_unique(array_filter(array_map(
            static fn (string $t): string => mb_substr(trim($t), 0, 30),
            explode(',', $str('tags'))
        ))));
        if (mb_strlen($tags) > 255) {
            return [[], 'Trop d\'étiquettes.'];
        }
        if ($phone === null && $email === '') {
            return [[], 'Indiquez au moins un numéro de téléphone ou une adresse e-mail.'];
        }

        return [[
            'name'              => $name,
            'phone'             => $phone,
            'email'             => $email !== '' ? $email : null,
            'birthday'          => $birthday !== '' ? $birthday : null,
            'tags'              => $tags !== '' ? $tags : null,
            'marketing_consent' => ($in['marketing_consent'] ?? false) === true ? 1 : 0,
        ], null];
    }

    /**
     * Insert (id = 0, with the welcome bonus) or update. Returns [id, error|null].
     *
     * @param array<string,mixed> $f validated by validate()
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $userId, int $id, array $f): array
    {
        $pdo = Database::connection();
        if ($f['phone'] !== null) {
            $dup = $pdo->prepare('SELECT id FROM clientbloom_customers WHERE organization_id = :oid AND phone = :p AND id <> :id');
            $dup->execute([':oid' => $orgId, ':p' => $f['phone'], ':id' => $id]);
            if ($dup->fetchColumn() !== false) {
                return [0, 'Un autre client a déjà ce numéro de téléphone.'];
            }
        }

        $params = [
            ':oid' => $orgId, ':name' => $f['name'], ':phone' => $f['phone'], ':email' => $f['email'],
            ':birthday' => $f['birthday'], ':tags' => $f['tags'], ':consent' => $f['marketing_consent'],
        ];

        if ($id === 0) {
            $pdo->prepare(
                'INSERT INTO clientbloom_customers (organization_id, name, phone, email, birthday, tags, marketing_consent, consent_at)
                 VALUES (:oid, :name, :phone, :email, :birthday, :tags, :consent, IF(:consent2 = 1, NOW(), NULL))'
            )->execute($params + [':consent2' => $f['marketing_consent']]);
            $id = (int) $pdo->lastInsertId();

            $bonus = Settings::get($orgId)['welcome_bonus_cents'];
            if ($bonus > 0) {
                Ledger::bonus($orgId, $userId, $id, $bonus, 'Bonus de bienvenue');
            }
            return [$id, null];
        }

        $params[':id'] = $id;
        $stmt = $pdo->prepare(
            'UPDATE clientbloom_customers
             SET name = :name, phone = :phone, email = :email, birthday = :birthday, tags = :tags,
                 consent_at = IF(:consent2 = 1, IF(marketing_consent = 1, consent_at, NOW()), NULL),
                 marketing_consent = :consent
             WHERE organization_id = :oid AND id = :id AND erased_at IS NULL'
        );
        $stmt->execute($params + [':consent2' => $f['marketing_consent']]);
        return self::find($orgId, $id) === null ? [0, 'Client introuvable.'] : [$id, null];
    }

    /**
     * Right to erasure: drop personal data, keep the anonymous ledger (financial record).
     */
    public static function erase(int $orgId, int $id): ?string
    {
        $c = self::find($orgId, $id);
        if ($c === null || $c['erased_at'] !== null) {
            return 'Client introuvable.';
        }
        if ((int) $c['balance_cents'] !== 0) {
            return 'Utilisez ou annulez le cashback restant avant d\'effacer ce client.';
        }
        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE clientbloom_customers
             SET name = \'Client effacé\', phone = NULL, email = NULL, birthday = NULL, tags = NULL,
                 marketing_consent = 0, consent_at = NULL, public_token = NULL, erased_at = NOW()
             WHERE organization_id = :oid AND id = :id'
        )->execute([':oid' => $orgId, ':id' => $id]);
        $pdo->prepare('DELETE FROM clientbloom_notes WHERE organization_id = :oid AND customer_id = :id')
            ->execute([':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function notes(int $orgId, int $customerId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT n.body, n.created_at, u.name AS author
             FROM clientbloom_notes n LEFT JOIN users u ON u.id = n.created_by
             WHERE n.organization_id = :oid AND n.customer_id = :id ORDER BY n.id DESC'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $customerId]);
        return $stmt->fetchAll();
    }

    public static function addNote(int $orgId, int $userId, int $customerId, string $body): ?string
    {
        $body = trim($body);
        if ($body === '' || mb_strlen($body) > 5000) {
            return 'La note est vide ou trop longue.';
        }
        $c = self::find($orgId, $customerId);
        if ($c === null || $c['erased_at'] !== null) {
            return 'Client introuvable.';
        }
        Database::connection()->prepare(
            'INSERT INTO clientbloom_notes (organization_id, customer_id, body, created_by) VALUES (:oid, :cid, :body, :by)'
        )->execute([':oid' => $orgId, ':cid' => $customerId, ':body' => $body, ':by' => $userId]);
        return null;
    }

    /** Unguessable link to the customer's loyalty card, created on first use. */
    public static function publicToken(int $orgId, int $id): string
    {
        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE clientbloom_customers SET public_token = :t
             WHERE organization_id = :oid AND id = :id AND public_token IS NULL AND erased_at IS NULL'
        )->execute([':t' => bin2hex(random_bytes(24)), ':oid' => $orgId, ':id' => $id]);
        $stmt = $pdo->prepare('SELECT public_token FROM clientbloom_customers WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return (string) $stmt->fetchColumn();
    }

    /**
     * @return array{0:int,1:array<string,mixed>}|null [org id, customer]
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT organization_id, id FROM clientbloom_customers WHERE public_token = :t AND erased_at IS NULL'
        );
        $stmt->execute([':t' => $token]);
        $row = $stmt->fetch();
        if (!is_array($row)) {
            return null;
        }
        $c = self::find((int) $row['organization_id'], (int) $row['id']);
        return $c !== null ? [(int) $row['organization_id'], $c] : null;
    }

    /**
     * Program KPIs for the overview page.
     *
     * @return array<string,int>
     */
    public static function stats(int $orgId): array
    {
        $pdo = Database::connection();
        $c = $pdo->prepare(
            'SELECT COUNT(*) AS customers,
                    COALESCE(SUM(last_visit_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) AS active_30d,
                    COALESCE(SUM(balance_cents), 0) AS outstanding_cents,
                    COALESCE(SUM(marketing_consent), 0) AS consented
             FROM clientbloom_customers WHERE organization_id = :oid AND erased_at IS NULL'
        );
        $c->execute([':oid' => $orgId]);
        $t = $pdo->prepare(
            // Reversals are netted against the type of the transaction they cancel.
            'SELECT COALESCE(SUM(CASE WHEN COALESCE(o.type, t.type) = \'purchase\'
                                       OR (t.type = \'adjust\' AND t.amount_cents < 0) THEN t.amount_cents END), 0) AS sales_cents,
                    COALESCE(SUM(CASE WHEN COALESCE(o.type, t.type) IN (\'purchase\', \'bonus\', \'adjust\')
                                       AND COALESCE(o.cashback_cents, t.cashback_cents) > 0 THEN t.cashback_cents END), 0) AS issued_cents,
                    COALESCE(-SUM(CASE WHEN COALESCE(o.type, t.type) = \'redeem\' THEN t.cashback_cents END), 0) AS redeemed_cents,
                    COUNT(DISTINCT CASE WHEN t.type = \'purchase\' THEN t.customer_id END) AS buyers
             FROM clientbloom_transactions t
             LEFT JOIN clientbloom_transactions o ON o.id = t.reversal_of
             WHERE t.organization_id = :oid AND t.created_at >= DATE_FORMAT(CURDATE(), \'%Y-%m-01\')'
        );
        $t->execute([':oid' => $orgId]);
        return array_map('intval', ($c->fetch() ?: []) + ($t->fetch() ?: []));
    }
}
