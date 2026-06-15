<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Database;
use App\Support\Reference;
use PDO;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * Base for DB-backed tests. Skips the whole case when no database is reachable
 * (so the unit suite still runs in environments without MariaDB). Truncates the
 * operational tables before each test, preserving reference/seed data
 * (fee_rules, payment_routes, provider_configs, roles, system_settings).
 */
abstract class IntegrationTestCase extends TestCase
{
    protected PDO $db;

    /** Operational tables wiped between tests (children before parents). */
    private const TRUNCATE = [
        'transaction_events', 'fees', 'reconciliation_items', 'reconciliation_batches',
        'settlements', 'settlement_batches', 'transactions', 'api_keys',
        'payment_links', 'qr_profiles', 'payment_requests',
        'virtual_credentials', 'payment_aliases', 'virtual_payment_profiles',
        'kyc_reviews', 'risk_reviews', 'merchant_bank_accounts', 'merchant_documents',
        'merchants', 'consumers', 'audit_logs', 'webhooks', 'notifications', 'users',
    ];

    protected function setUp(): void
    {
        try {
            $this->db = Database::connection();
            $this->db->query('SELECT 1');
        } catch (Throwable $e) {
            self::markTestSkipped('No database available: ' . $e->getMessage());
        }

        $this->db->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (self::TRUNCATE as $table) {
            $this->db->exec("TRUNCATE TABLE {$table}");
        }
        $this->db->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    /**
     * Create a user + merchant. By default the merchant is APPROVED/CLEARED.
     *
     * @return array{user_id:int,merchant_id:int,merchant_reference:string}
     */
    protected function seedMerchant(bool $approved = true): array
    {
        $email = 'm' . bin2hex(random_bytes(4)) . '@test.local';
        $this->db->prepare(
            "INSERT INTO users (email, password_hash, name, role, is_active) VALUES (:e, :p, 'Test Merchant', 'merchant', 1)"
        )->execute([':e' => $email, ':p' => password_hash('x', PASSWORD_DEFAULT)]);
        $userId = (int) $this->db->lastInsertId();

        $ref  = Reference::merchant();
        $rmid = Reference::merchant();
        $this->db->prepare(
            'INSERT INTO merchants
                (user_id, regulated_entity, regulated_merchant_id, merchant_reference, legal_name,
                 country, kyc_status, compliance_status, settlement_account, status, created_at, updated_at)
             VALUES (:u, :e, :rmid, :ref, :name, :c, :kyc, :comp, :acct, :status, NOW(), NOW())'
        )->execute([
            ':u'      => $userId,
            ':e'      => 'PassPass',
            ':rmid'   => $rmid,
            ':ref'    => $ref,
            ':name'   => 'Test Merchant Ltd',
            ':c'      => 'MU',
            ':kyc'    => $approved ? 'APPROVED' : 'DRAFT',
            ':comp'   => $approved ? 'CLEARED' : 'PENDING',
            ':acct'   => 'STL_TEST_ACCT',
            ':status' => 'ACTIVE',
        ]);
        $merchantId = (int) $this->db->lastInsertId();

        return ['user_id' => $userId, 'merchant_id' => $merchantId, 'merchant_reference' => $ref];
    }

    /** @return array<string,mixed> */
    protected function merchantRow(int $merchantId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE id = :id');
        $stmt->execute([':id' => $merchantId]);
        /** @var array<string,mixed> $row */
        $row = $stmt->fetch();
        return $row;
    }
}
