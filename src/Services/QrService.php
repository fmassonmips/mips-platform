<?php
/**
 * Merchant QR: STATIC (open amount), DYNAMIC (fixed amount), or REQUEST (a
 * specific payment request). Scanning/paying a QR routes through PaymentService
 * as a QR transaction.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Domain\PaymentType;
use App\Support\Money;
use App\Support\Reference;
use PDO;
use RuntimeException;

final class QrService
{
    private const TYPES = ['STATIC', 'DYNAMIC', 'REQUEST'];

    public function __construct(
        private readonly PDO $db,
        private readonly PaymentService $payments,
    ) {
    }

    public static function make(): self
    {
        return new self(Database::connection(), PaymentService::make());
    }

    /**
     * @param array<string,mixed> $input
     * @return array<string,mixed> The created qr_profile row.
     */
    public function create(int $userId, array $input): array
    {
        $merchant = $this->merchantForUser($userId);

        $qrType = strtoupper((string) ($input['qr_type'] ?? 'STATIC'));
        if (!in_array($qrType, self::TYPES, true)) {
            throw new RuntimeException('qr_type must be STATIC, DYNAMIC or REQUEST.');
        }

        $currency    = strtoupper((string) ($input['currency'] ?? Money::DEFAULT_CURRENCY));
        $amountMinor = null;
        if ($qrType !== 'STATIC') {
            if (!isset($input['amount']) || (string) $input['amount'] === '') {
                throw new RuntimeException('DYNAMIC and REQUEST QR require an amount.');
            }
            $amountMinor = Money::toMinor((string) $input['amount'], $currency);
        }

        $reference = Reference::generate('QRP');
        // The QR payload a wallet would encode. References our resolve endpoint.
        $payload = json_encode([
            'v'        => 1,
            'ref'      => $reference,
            'merchant' => $merchant['merchant_reference'],
            'type'     => $qrType,
            'amount'   => $amountMinor,
            'currency' => $currency,
        ], JSON_UNESCAPED_SLASHES);

        $stmt = $this->db->prepare(
            'INSERT INTO qr_profiles (merchant_id, qr_reference, qr_type, amount_minor, currency, payload, created_at)
             VALUES (:mid, :ref, :type, :amt, :cur, :payload, NOW())'
        );
        $stmt->execute([
            ':mid'     => (int) $merchant['id'],
            ':ref'     => $reference,
            ':type'    => $qrType,
            ':amt'     => $amountMinor,
            ':cur'     => $currency,
            ':payload' => $payload,
        ]);

        return $this->findByReference($reference) ?? throw new RuntimeException('QR missing after insert.');
    }

    /** @return array<string,mixed>|null */
    public function findByReference(string $ref): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT q.*, m.merchant_reference, m.legal_name
               FROM qr_profiles q JOIN merchants m ON m.id = q.merchant_id
              WHERE q.qr_reference = :r LIMIT 1'
        );
        $stmt->execute([':r' => $ref]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /** @return list<array<string,mixed>> */
    public function listForUser(int $userId): array
    {
        $merchant = $this->merchantForUser($userId);
        $stmt = $this->db->prepare('SELECT * FROM qr_profiles WHERE merchant_id = :m ORDER BY id DESC');
        $stmt->execute([':m' => (int) $merchant['id']]);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed> The transaction row.
     */
    public function pay(string $qrReference, ?int $consumerId, ?string $payerAmount = null): array
    {
        $qr = $this->findByReference($qrReference);
        if ($qr === null) {
            throw new RuntimeException('QR profile not found.');
        }
        if ((int) $qr['is_active'] !== 1) {
            throw new RuntimeException('This QR is inactive.');
        }

        $currency = (string) $qr['currency'];
        if ($qr['amount_minor'] !== null) {
            $amountMinor = (int) $qr['amount_minor'];
        } elseif ($payerAmount !== null && $payerAmount !== '') {
            $amountMinor = Money::toMinor($payerAmount, $currency);
        } else {
            throw new RuntimeException('This static QR requires the payer to enter an amount.');
        }

        return $this->payments->create([
            'payment_type'       => PaymentType::Qr->value,
            'amount_minor'       => $amountMinor,
            'currency'           => $currency,
            'merchant_reference' => $qr['merchant_reference'],
            'source'             => 'QR',
            'source_reference'   => $qr['qr_reference'],
        ], $consumerId);
    }

    /** @return array<string,mixed> */
    private function merchantForUser(int $userId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE user_id = :u ORDER BY id LIMIT 1');
        $stmt->execute([':u' => $userId]);
        $m = $stmt->fetch();
        if (!is_array($m)) {
            throw new RuntimeException('No merchant account for this user.');
        }
        return $m;
    }
}
