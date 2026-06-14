<?php
/**
 * Compliance decisions — a REGULATED activity performed by PassPass compliance
 * officers. Approving a merchant calls PassPass and advances KYC to APPROVED and
 * compliance to CLEARED, which is what unlocks transacting.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Domain\RiskRating;
use App\Providers\PassPassProvider;
use App\Support\Audit;
use PDO;
use RuntimeException;

final class ComplianceService
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
    private function findMerchant(string $ref): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE merchant_reference = :r LIMIT 1');
        $stmt->execute([':r' => $ref]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Approve or reject a merchant's KYC.
     *
     * @return array<string,mixed> Updated merchant row.
     */
    public function decide(string $merchantRef, int $reviewerUserId, string $decision, ?string $notes = null): array
    {
        $merchant = $this->findMerchant($merchantRef);
        if ($merchant === null) {
            throw new RuntimeException('Merchant not found.');
        }
        $decision = strtoupper($decision);
        if (!in_array($decision, ['APPROVE', 'REJECT'], true)) {
            throw new RuntimeException('decision must be APPROVE or REJECT.');
        }

        if ($decision === 'APPROVE') {
            $this->passpass()->approveMerchant((string) $merchant['regulated_merchant_id']);
            $kyc        = 'APPROVED';
            $compliance = 'CLEARED';
        } else {
            $kyc        = 'REJECTED';
            $compliance = 'FLAGGED';
        }

        $this->db->beginTransaction();
        try {
            $u = $this->db->prepare(
                'UPDATE merchants SET kyc_status = :k, compliance_status = :c, updated_at = NOW() WHERE id = :id'
            );
            $u->execute([':k' => $kyc, ':c' => $compliance, ':id' => (int) $merchant['id']]);

            $r = $this->db->prepare(
                'UPDATE kyc_reviews
                    SET status = :s, reviewer_user_id = :rev, decision = :dec, notes = :notes, decided_at = NOW()
                  WHERE merchant_id = :m
                  ORDER BY id DESC LIMIT 1'
            );
            $r->execute([
                ':s'     => $kyc,
                ':rev'   => $reviewerUserId,
                ':dec'   => $decision,
                ':notes' => $notes,
                ':m'     => (int) $merchant['id'],
            ]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        Audit::log(
            $reviewerUserId,
            'compliance_officer',
            'KYC_' . $decision,
            'merchant',
            (string) $merchant['merchant_reference'],
            ['kyc_status' => $merchant['kyc_status'], 'compliance_status' => $merchant['compliance_status']],
            ['kyc_status' => $kyc, 'compliance_status' => $compliance],
        );

        return $this->findMerchant($merchantRef) ?? $merchant;
    }

    /**
     * Record a risk score (0-100) and derived rating for a merchant.
     *
     * @param array<string,mixed> $factors
     * @return array<string,mixed> Updated merchant row.
     */
    public function score(string $merchantRef, int $reviewerUserId, int $score, array $factors = [], ?string $notes = null): array
    {
        $merchant = $this->findMerchant($merchantRef);
        if ($merchant === null) {
            throw new RuntimeException('Merchant not found.');
        }
        $score  = max(0, min(100, $score));
        $rating = RiskRating::fromScore($score);

        $this->db->beginTransaction();
        try {
            $r = $this->db->prepare(
                'INSERT INTO risk_reviews (merchant_id, score, rating, factors, reviewer_user_id, notes, created_at)
                 VALUES (:m, :score, :rating, :factors, :rev, :notes, NOW())'
            );
            $r->execute([
                ':m'       => (int) $merchant['id'],
                ':score'   => $score,
                ':rating'  => $rating->value,
                ':factors' => json_encode($factors, JSON_UNESCAPED_SLASHES),
                ':rev'     => $reviewerUserId,
                ':notes'   => $notes,
            ]);

            $u = $this->db->prepare(
                'UPDATE merchants SET risk_score = :s, risk_rating = :r, updated_at = NOW() WHERE id = :id'
            );
            $u->execute([':s' => $score, ':r' => $rating->value, ':id' => (int) $merchant['id']]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return $this->findMerchant($merchantRef) ?? $merchant;
    }
}
