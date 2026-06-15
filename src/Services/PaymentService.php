<?php
/**
 * Payment orchestration: route → execute via provider → persist → record events.
 *
 * The platform (MIPSIT) orchestrates; the regulated provider (PassPass, by
 * default routing) executes. Every status change is guarded by the
 * TransactionStatus state machine and written to transaction_events.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Domain\PaymentType;
use App\Domain\TransactionStatus;
use App\Providers\PaymentRequest;
use App\Routing\PaymentRouter;
use App\Support\Reference;
use PDO;
use RuntimeException;

final class PaymentService
{
    public function __construct(
        private readonly PDO $db,
        private readonly PaymentRouter $router,
    ) {
    }

    public static function make(): self
    {
        return new self(Database::connection(), PaymentRouter::fromGlobalConfig());
    }

    /** @return array<string,mixed>|null */
    public function findByReference(string $ref): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM transactions WHERE transaction_reference = :r LIMIT 1');
        $stmt->execute([':r' => $ref]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Create and execute a payment.
     *
     * @param array<string,mixed> $input  Requires payment_type, amount_minor, merchant_reference.
     * @return array<string,mixed> The transaction row.
     */
    public function create(array $input, ?int $consumerId = null): array
    {
        $type = PaymentType::tryFrom(strtoupper((string) ($input['payment_type'] ?? '')));
        if ($type === null) {
            throw new RuntimeException('Unknown payment_type.');
        }
        $amount = (int) ($input['amount_minor'] ?? 0);
        if ($amount <= 0) {
            throw new RuntimeException('amount_minor must be a positive integer (minor units).');
        }
        $currency = strtoupper((string) ($input['currency'] ?? ($GLOBALS['config']['platform']['base_currency'] ?? 'MUR')));

        // Idempotency: return the existing transaction for a repeated key.
        $idempotencyKey = isset($input['idempotency_key']) ? (string) $input['idempotency_key'] : null;
        if ($idempotencyKey !== null && $idempotencyKey !== '') {
            $existing = $this->db->prepare('SELECT * FROM transactions WHERE idempotency_key = :k LIMIT 1');
            $existing->execute([':k' => $idempotencyKey]);
            $row = $existing->fetch();
            if (is_array($row)) {
                return $row;
            }
        }

        // Resolve merchant and enforce the compliance gate.
        $merchant = $this->requireTransactableMerchant((string) ($input['merchant_reference'] ?? ''));

        // Compute fee from the active fee rule for this payment type.
        [$feeMinor, $feeRuleId] = $this->computeFee($type, $amount, $currency);
        $netMinor = $amount - $feeMinor;

        $reference = Reference::transaction();

        // 1) Persist the attempt in CREATED.
        $stmt = $this->db->prepare(
            'INSERT INTO transactions
                (transaction_reference, regulated_entity, regulated_merchant_id, merchant_id, consumer_id,
                 payment_type, amount_minor, fee_minor, net_minor, currency, status,
                 merchant_reference, source, source_reference, idempotency_key, metadata, created_at, updated_at)
             VALUES
                (:ref, :entity, :rmid, :mid, :cid, :ptype, :amount, :fee, :net, :cur, :status,
                 :mref, :source, :sref, :idem, :meta, NOW(), NOW())'
        );
        $stmt->execute([
            ':ref'    => $reference,
            ':entity' => $GLOBALS['config']['platform']['regulated_entity'] ?? 'PassPass',
            ':rmid'   => $merchant['regulated_merchant_id'],
            ':mid'    => (int) $merchant['id'],
            ':cid'    => $consumerId,
            ':ptype'  => $type->value,
            ':amount' => $amount,
            ':fee'    => $feeMinor,
            ':net'    => $netMinor,
            ':cur'    => $currency,
            ':status' => TransactionStatus::Created->value,
            ':mref'   => $input['merchant_reference_external'] ?? null,
            ':source' => strtoupper((string) ($input['source'] ?? 'API')),
            ':sref'   => $input['source_reference'] ?? null,
            ':idem'   => $idempotencyKey,
            ':meta'   => isset($input['metadata']) ? json_encode($input['metadata'], JSON_UNESCAPED_SLASHES) : null,
        ]);
        $txnId = (int) $this->db->lastInsertId();

        $this->recordEvent($txnId, null, TransactionStatus::Created, 'CREATE', null, 'Transaction created');

        if ($feeRuleId !== null && $feeMinor > 0) {
            $f = $this->db->prepare(
                'INSERT INTO fees (transaction_id, fee_rule_id, amount_minor, currency, type, created_at)
                 VALUES (:t, :fr, :amt, :cur, :type, NOW())'
            );
            $f->execute([':t' => $txnId, ':fr' => $feeRuleId, ':amt' => $feeMinor, ':cur' => $currency, ':type' => 'PROCESSING']);
        }

        // 2) Route and execute via the provider.
        $provider = $this->router->route($type);
        $result   = $provider->createPayment(new PaymentRequest(
            type: $type,
            amountMinor: $amount,
            currency: $currency,
            merchantReference: (string) $merchant['merchant_reference'],
            regulatedMerchantId: (string) $merchant['regulated_merchant_id'],
            idempotencyKey: $idempotencyKey,
        ));

        if (!$result->success || $result->status === null) {
            $this->transition($txnId, TransactionStatus::Created, TransactionStatus::Failed, 'PROVIDER_UPDATE', $provider->name(), (string) $result->errorMessage);
            return $this->findByReference($reference) ?? throw new RuntimeException('Transaction missing after failure.');
        }

        // 3) Record provider reference + regulated id and transition to the
        //    provider-reported status.
        $upd = $this->db->prepare(
            'UPDATE transactions
                SET provider_name = :pn, provider_reference = :pr, regulated_transaction_id = :rtid
              WHERE id = :id'
        );
        $upd->execute([
            ':pn'   => $result->providerName,
            ':pr'   => $result->providerReference,
            ':rtid' => $result->raw['regulated_transaction_id'] ?? null,
            ':id'   => $txnId,
        ]);

        $this->transition($txnId, TransactionStatus::Created, $result->status, 'PROVIDER_UPDATE', $result->providerName, 'Provider accepted payment');

        return $this->findByReference($reference) ?? throw new RuntimeException('Transaction missing after create.');
    }

    /**
     * Apply an inbound provider result (e.g. a webhook) confirming a payment.
     * In the sandbox this is driven by the simulate endpoint.
     *
     * @return array<string,mixed> Updated transaction row.
     */
    public function confirmPaid(string $reference): array
    {
        $txn = $this->findByReference($reference);
        if ($txn === null) {
            throw new RuntimeException('Transaction not found.');
        }
        $current = TransactionStatus::from((string) $txn['status']);
        $this->transition((int) $txn['id'], $current, TransactionStatus::Paid, 'WEBHOOK', (string) $txn['provider_name'], 'Payment confirmed');
        return $this->findByReference($reference) ?? $txn;
    }

    /**
     * Guarded status transition + event log. Throws if the transition is invalid.
     */
    public function transition(int $txnId, TransactionStatus $from, TransactionStatus $to, string $eventType, ?string $providerName, ?string $message): void
    {
        if ($from !== $to && !$from->canTransitionTo($to)) {
            throw new RuntimeException(sprintf('Illegal transition %s -> %s', $from->value, $to->value));
        }
        $u = $this->db->prepare('UPDATE transactions SET status = :s, updated_at = NOW() WHERE id = :id');
        $u->execute([':s' => $to->value, ':id' => $txnId]);
        $this->recordEvent($txnId, $from, $to, $eventType, $providerName, $message);
    }

    private function recordEvent(int $txnId, ?TransactionStatus $from, TransactionStatus $to, string $eventType, ?string $providerName, ?string $message): void
    {
        $e = $this->db->prepare(
            'INSERT INTO transaction_events (transaction_id, from_status, to_status, event_type, provider_name, message, created_at)
             VALUES (:t, :from, :to, :etype, :pn, :msg, NOW())'
        );
        $e->execute([
            ':t'     => $txnId,
            ':from'  => $from?->value,
            ':to'    => $to->value,
            ':etype' => $eventType,
            ':pn'    => $providerName,
            ':msg'   => $message,
        ]);
    }

    /**
     * @return array{0:int,1:?int} [feeMinor, feeRuleId]
     */
    private function computeFee(PaymentType $type, int $amount, string $currency): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM fee_rules
              WHERE is_active = 1 AND scope = 'GLOBAL'
                AND (payment_type = :pt OR payment_type IS NULL)
                AND currency = :cur
              ORDER BY (payment_type IS NULL), priority
              LIMIT 1"
        );
        $stmt->execute([':pt' => $type->value, ':cur' => $currency]);
        $rule = $stmt->fetch();
        if (!is_array($rule)) {
            return [0, null];
        }

        $fee = intdiv($amount * (int) $rule['percent_bps'], 10000) + (int) $rule['fixed_minor'];
        if ($rule['min_minor'] !== null) {
            $fee = max($fee, (int) $rule['min_minor']);
        }
        if ($rule['max_minor'] !== null) {
            $fee = min($fee, (int) $rule['max_minor']);
        }
        $fee = max(0, min($fee, $amount)); // never exceed the amount
        return [$fee, (int) $rule['id']];
    }

    /** @return array<string,mixed> */
    private function requireTransactableMerchant(string $merchantRef): array
    {
        if ($merchantRef === '') {
            throw new RuntimeException('merchant_reference is required.');
        }
        $stmt = $this->db->prepare('SELECT * FROM merchants WHERE merchant_reference = :r LIMIT 1');
        $stmt->execute([':r' => $merchantRef]);
        $merchant = $stmt->fetch();
        if (!is_array($merchant)) {
            throw new RuntimeException('Merchant not found.');
        }
        if ((string) $merchant['kyc_status'] !== 'APPROVED' || (string) $merchant['compliance_status'] !== 'CLEARED') {
            throw new RuntimeException('Merchant is not cleared to transact (KYC/compliance gate).');
        }
        return $merchant;
    }
}
