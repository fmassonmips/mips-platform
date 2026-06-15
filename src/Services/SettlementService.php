<?php
/**
 * Settlement engine. Groups a merchant's PAID transactions into a batch and
 * creates a settlement to the merchant's settlement account via PassPass (the
 * regulated entity supervises settlement execution).
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Domain\TransactionStatus;
use App\Providers\PassPassProvider;
use App\Support\Audit;
use App\Support\Reference;
use PDO;
use RuntimeException;

final class SettlementService
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

    private function passpass(): PassPassProvider
    {
        /** @var array<string,mixed> $cfg */
        $cfg = $GLOBALS['config']['providers']['passpass'] ?? [];
        return new PassPassProvider($cfg);
    }

    /**
     * Settle all PAID transactions for a merchant into a new batch.
     *
     * @return array<string,mixed> Summary: batch, settlement, transaction count.
     */
    public function settleMerchant(string $merchantRef, ?int $actorUserId = null): array
    {
        $m = $this->db->prepare('SELECT * FROM merchants WHERE merchant_reference = :r LIMIT 1');
        $m->execute([':r' => $merchantRef]);
        $merchant = $m->fetch();
        if (!is_array($merchant)) {
            throw new RuntimeException('Merchant not found.');
        }

        $t = $this->db->prepare("SELECT * FROM transactions WHERE merchant_id = :mid AND status = 'PAID' ORDER BY id");
        $t->execute([':mid' => (int) $merchant['id']]);
        $txns = $t->fetchAll();
        if (!$txns) {
            throw new RuntimeException('No PAID transactions to settle for this merchant.');
        }

        $currency = (string) $txns[0]['currency'];
        $gross = 0;
        $fees  = 0;
        foreach ($txns as $txn) {
            $gross += (int) $txn['amount_minor'];
            $fees  += (int) $txn['fee_minor'];
        }
        $net = $gross - $fees;

        $batchRef      = Reference::batch();
        $settlementRef = Reference::settlement();
        $account       = (string) ($merchant['settlement_account'] ?? '');

        $this->db->beginTransaction();
        try {
            $b = $this->db->prepare(
                'INSERT INTO settlement_batches
                    (batch_reference, regulated_entity, provider_name, status, total_amount_minor,
                     currency, transaction_count, settlement_account, executed_at, created_at)
                 VALUES (:ref, :entity, :prov, :status, :total, :cur, :count, :acct, NOW(), NOW())'
            );
            $b->execute([
                ':ref'    => $batchRef,
                ':entity' => $GLOBALS['config']['platform']['regulated_entity'] ?? 'PassPass',
                ':prov'   => 'passpass',
                ':status' => 'SETTLED',
                ':total'  => $net,
                ':cur'    => $currency,
                ':count'  => count($txns),
                ':acct'   => $account,
            ]);
            $batchId = (int) $this->db->lastInsertId();

            // Regulated entity executes/supervises the settlement.
            $res = $this->passpass()->createSettlement([
                'settlement_batch_id' => $batchRef,
                'settlement_account'  => $account,
                'amount_minor'        => $net,
            ]);

            $s = $this->db->prepare(
                'INSERT INTO settlements
                    (settlement_reference, batch_id, merchant_id, regulated_entity, settlement_account,
                     amount_minor, fee_minor, net_minor, currency, status, provider_reference, settled_at, created_at)
                 VALUES (:ref, :batch, :mid, :entity, :acct, :gross, :fee, :net, :cur, :status, :pref, NOW(), NOW())'
            );
            $s->execute([
                ':ref'    => $settlementRef,
                ':batch'  => $batchId,
                ':mid'    => (int) $merchant['id'],
                ':entity' => $GLOBALS['config']['platform']['regulated_entity'] ?? 'PassPass',
                ':acct'   => $account,
                ':gross'  => $gross,
                ':fee'    => $fees,
                ':net'    => $net,
                ':cur'    => $currency,
                ':status' => 'SETTLED',
                ':pref'   => $res->providerReference,
            ]);
            $settlementId = (int) $this->db->lastInsertId();

            // Link each transaction and advance PAID -> SETTLED.
            foreach ($txns as $txn) {
                $link = $this->db->prepare(
                    'UPDATE transactions
                        SET settlement_id = :sid, settlement_batch_id = :bref
                      WHERE id = :id'
                );
                $link->execute([':sid' => $settlementId, ':bref' => $batchRef, ':id' => (int) $txn['id']]);

                $this->payments->transition(
                    (int) $txn['id'],
                    TransactionStatus::Paid,
                    TransactionStatus::Settled,
                    'SETTLEMENT',
                    'passpass',
                    'Settled in batch ' . $batchRef,
                );
            }

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        Audit::log($actorUserId, 'finance_officer', 'SETTLEMENT_CREATE', 'settlement', $settlementRef, null, [
            'batch'        => $batchRef,
            'merchant'     => $merchantRef,
            'gross_minor'  => $gross,
            'fee_minor'    => $fees,
            'net_minor'    => $net,
            'transactions' => count($txns),
        ]);

        return [
            'batch_reference'      => $batchRef,
            'settlement_reference' => $settlementRef,
            'currency'             => $currency,
            'gross_minor'          => $gross,
            'fee_minor'            => $fees,
            'net_minor'            => $net,
            'transaction_count'    => count($txns),
        ];
    }
}
