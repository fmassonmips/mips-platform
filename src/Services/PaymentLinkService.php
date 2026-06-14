<?php
/**
 * Payment links: a merchant generates a shareable link; a customer pays it.
 * Paying a link routes through PaymentService as a PAYMENT_LINK transaction.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Domain\PaymentType;
use App\Support\Money;
use App\Support\Reference;
use PDO;
use RuntimeException;

final class PaymentLinkService
{
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
     * @return array<string,mixed> The created link row.
     */
    public function create(int $userId, array $input): array
    {
        $merchant = $this->merchantForUser($userId);

        $amountMinor = null;
        if (isset($input['amount']) && (string) $input['amount'] !== '') {
            $amountMinor = Money::toMinor((string) $input['amount'], (string) ($input['currency'] ?? Money::DEFAULT_CURRENCY));
            if ($amountMinor <= 0) {
                throw new RuntimeException('amount must be positive (or omitted for a payer-entered amount).');
            }
        }

        $reference = Reference::generate('LNK');
        $slug      = strtolower(Reference::generate('p', 4));
        $slug      = preg_replace('/[^a-z0-9]/', '', strtolower(str_replace('_', '', $slug))) ?? $slug;

        $stmt = $this->db->prepare(
            'INSERT INTO payment_links
                (merchant_id, link_reference, slug, amount_minor, currency, description, status, max_uses, expires_at, created_at)
             VALUES (:mid, :ref, :slug, :amt, :cur, :desc, :status, :max, :exp, NOW())'
        );
        $stmt->execute([
            ':mid'    => (int) $merchant['id'],
            ':ref'    => $reference,
            ':slug'   => $slug,
            ':amt'    => $amountMinor,
            ':cur'    => strtoupper((string) ($input['currency'] ?? Money::DEFAULT_CURRENCY)),
            ':desc'   => $input['description'] ?? null,
            ':status' => 'ACTIVE',
            ':max'    => isset($input['max_uses']) && $input['max_uses'] !== '' ? (int) $input['max_uses'] : null,
            ':exp'    => $input['expires_at'] ?? null,
        ]);

        return $this->findBySlug($slug) ?? throw new RuntimeException('Link missing after insert.');
    }

    /** @return array<string,mixed>|null */
    public function findBySlug(string $slug): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT pl.*, m.merchant_reference, m.legal_name, m.trading_name
               FROM payment_links pl JOIN merchants m ON m.id = pl.merchant_id
              WHERE pl.slug = :s LIMIT 1'
        );
        $stmt->execute([':s' => $slug]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /** @return list<array<string,mixed>> */
    public function listForUser(int $userId): array
    {
        $merchant = $this->merchantForUser($userId);
        $stmt = $this->db->prepare('SELECT * FROM payment_links WHERE merchant_id = :m ORDER BY id DESC');
        $stmt->execute([':m' => (int) $merchant['id']]);
        return $stmt->fetchAll();
    }

    /**
     * Pay a link. Amount comes from the link, or from the payer for open links.
     *
     * @return array<string,mixed> The transaction row.
     */
    public function pay(string $slug, ?int $consumerId, ?string $payerAmount = null): array
    {
        $link = $this->findBySlug($slug);
        if ($link === null) {
            throw new RuntimeException('Payment link not found.');
        }
        if ((string) $link['status'] !== 'ACTIVE') {
            throw new RuntimeException('This payment link is not active.');
        }
        if ($link['expires_at'] !== null && strtotime((string) $link['expires_at']) < time()) {
            throw new RuntimeException('This payment link has expired.');
        }
        if ($link['max_uses'] !== null && (int) $link['uses'] >= (int) $link['max_uses']) {
            throw new RuntimeException('This payment link has reached its usage limit.');
        }

        $currency = (string) $link['currency'];
        if ($link['amount_minor'] !== null) {
            $amountMinor = (int) $link['amount_minor'];
        } elseif ($payerAmount !== null && $payerAmount !== '') {
            $amountMinor = Money::toMinor($payerAmount, $currency);
        } else {
            throw new RuntimeException('This link requires the payer to enter an amount.');
        }

        $txn = $this->payments->create([
            'payment_type'       => PaymentType::PaymentLink->value,
            'amount_minor'       => $amountMinor,
            'currency'           => $currency,
            'merchant_reference' => $link['merchant_reference'],
            'source'             => 'LINK',
            'source_reference'   => $link['link_reference'],
        ], $consumerId);

        $u = $this->db->prepare('UPDATE payment_links SET uses = uses + 1 WHERE id = :id');
        $u->execute([':id' => (int) $link['id']]);

        return $txn;
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
