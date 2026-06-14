<?php
/**
 * Merchant onboarding (technology layer) backed by the regulated PSP.
 *
 * Creating a merchant calls PassPass (the regulated entity) to issue a
 * regulated_merchant_id; the platform stores its own merchant_reference for
 * orchestration. KYC submission records documents and a kyc_reviews row for a
 * PassPass compliance officer to decide on.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Providers\PassPassProvider;
use App\Support\Reference;
use PDO;
use RuntimeException;

final class MerchantService
{
    public function __construct(private readonly PDO $db)
    {
    }

    public static function make(): self
    {
        return new self(Database::connection());
    }

    private function passpass(): PassPassProvider
    {
        /** @var array<string,mixed> $cfg */
        $cfg = $GLOBALS['config']['providers']['passpass'] ?? [];
        return new PassPassProvider($cfg);
    }

    /** @return array<string,mixed>|null */
    public function findByReference(string $ref): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE merchant_reference = :r LIMIT 1');
        $stmt->execute([':r' => $ref]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /** @return array<string,mixed>|null */
    public function findByUser(int $userId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE user_id = :u ORDER BY id LIMIT 1');
        $stmt->execute([':u' => $userId]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<string,mixed> $input
     * @return array<string,mixed> The created merchant row.
     */
    public function create(int $userId, array $input): array
    {
        $legalName = trim((string) ($input['legal_name'] ?? ''));
        if ($legalName === '') {
            throw new RuntimeException('legal_name is required.');
        }

        // Regulated entity issues the regulated_merchant_id.
        $res = $this->passpass()->createMerchant([
            'legal_name'   => $legalName,
            'trading_name' => $input['trading_name'] ?? null,
            'country'      => $input['country'] ?? 'MU',
        ]);
        if (!$res->success) {
            throw new RuntimeException('PassPass rejected merchant creation: ' . (string) $res->errorMessage);
        }

        $regulatedMerchantId = (string) ($res->raw['regulated_merchant_id'] ?? Reference::merchant());
        $merchantReference   = Reference::merchant();

        $stmt = $this->db->prepare(
            'INSERT INTO merchants
                (user_id, regulated_entity, regulated_merchant_id, merchant_reference,
                 legal_name, trading_name, business_type, registration_number, country,
                 contact_email, contact_phone, kyc_status, compliance_status, status, created_at, updated_at)
             VALUES
                (:uid, :entity, :rmid, :ref, :legal, :trading, :btype, :regno, :country,
                 :email, :phone, :kyc, :compliance, :status, NOW(), NOW())'
        );
        $stmt->execute([
            ':uid'        => $userId,
            ':entity'     => $GLOBALS['config']['platform']['regulated_entity'] ?? 'PassPass',
            ':rmid'       => $regulatedMerchantId,
            ':ref'        => $merchantReference,
            ':legal'      => $legalName,
            ':trading'    => $input['trading_name'] ?? null,
            ':btype'      => $input['business_type'] ?? null,
            ':regno'      => $input['registration_number'] ?? null,
            ':country'    => $input['country'] ?? 'MU',
            ':email'      => $input['contact_email'] ?? null,
            ':phone'      => $input['contact_phone'] ?? null,
            ':kyc'        => 'DRAFT',
            ':compliance' => 'PENDING',
            ':status'     => 'ACTIVE',
        ]);

        return $this->findByReference($merchantReference) ?? throw new RuntimeException('Merchant not found after insert.');
    }

    /**
     * Submit KYC for review. Records optional documents and a kyc_reviews row,
     * and advances the merchant to SUBMITTED.
     *
     * @param list<array{doc_type:string,file_reference:string}> $documents
     * @return array<string,mixed> The updated merchant row.
     */
    public function submitKyc(string $merchantRef, array $documents = []): array
    {
        $merchant = $this->findByReference($merchantRef);
        if ($merchant === null) {
            throw new RuntimeException('Merchant not found.');
        }

        $this->passpass()->submitKyc((string) $merchant['regulated_merchant_id'], ['documents' => $documents]);

        $this->db->beginTransaction();
        try {
            foreach ($documents as $doc) {
                $d = $this->db->prepare(
                    'INSERT INTO merchant_documents (merchant_id, doc_type, file_reference, status, uploaded_at)
                     VALUES (:m, :t, :f, :s, NOW())'
                );
                $d->execute([
                    ':m' => (int) $merchant['id'],
                    ':t' => (string) ($doc['doc_type'] ?? 'OTHER'),
                    ':f' => (string) ($doc['file_reference'] ?? ''),
                    ':s' => 'PENDING',
                ]);
            }

            $r = $this->db->prepare(
                'INSERT INTO kyc_reviews (merchant_id, status, submitted_at, created_at)
                 VALUES (:m, :s, NOW(), NOW())'
            );
            $r->execute([':m' => (int) $merchant['id'], ':s' => 'SUBMITTED']);

            $u = $this->db->prepare(
                'UPDATE merchants SET kyc_status = :s, updated_at = NOW() WHERE id = :id'
            );
            $u->execute([':s' => 'SUBMITTED', ':id' => (int) $merchant['id']]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return $this->findByReference($merchantRef) ?? $merchant;
    }
}
