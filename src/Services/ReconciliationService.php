<?php
/**
 * Reconciliation engine. Three-way matching of transaction ↔ settlement ↔ bank
 * file, flagging the exception taxonomy from the brief:
 *   MISSING_SETTLEMENT, DUPLICATE_SETTLEMENT, AMOUNT_MISMATCH, REFERENCE_MISMATCH.
 *
 * In the sandbox the "bank file" can be supplied to the run (a list of
 * {reference, amount_minor} the partner bank reported); if omitted, it is
 * synthesised from our own settlements (the happy path, everything matches).
 *
 * Matched settlements (and their transactions) advance SETTLED -> RECONCILED.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Domain\TransactionStatus;
use App\Support\Audit;
use App\Support\Reference;
use PDO;

final class ReconciliationService
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
     * @param list<array{reference?:string,amount_minor?:int}>|null $bankFile
     *        Bank-reported lines; null = synthesise from settlements.
     * @return array<string,mixed> Run summary.
     */
    public function run(?string $merchantRef = null, ?array $bankFile = null, ?int $actorUserId = null): array
    {
        // Settlements eligible for reconciliation (SETTLED, not yet RECONCILED).
        if ($merchantRef !== null && $merchantRef !== '') {
            $sql = "SELECT s.* FROM settlements s
                      JOIN merchants m ON m.id = s.merchant_id
                     WHERE s.status = 'SETTLED' AND m.merchant_reference = :r ORDER BY s.id";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([':r' => $merchantRef]);
        } else {
            $stmt = $this->db->query("SELECT * FROM settlements WHERE status = 'SETTLED' ORDER BY id");
        }
        $settlements = $stmt->fetchAll();

        // Build the bank-file index: reference => [count, amount_minor].
        $source = $bankFile !== null ? 'BANK_FILE' : 'PROVIDER';
        if ($bankFile === null) {
            $bankFile = array_map(
                static fn (array $s): array => ['reference' => (string) $s['settlement_reference'], 'amount_minor' => (int) $s['net_minor']],
                $settlements,
            );
        }
        $bankIndex = [];
        foreach ($bankFile as $line) {
            $ref = (string) ($line['reference'] ?? '');
            if ($ref === '') {
                continue;
            }
            $bankIndex[$ref] ??= ['count' => 0, 'amount_minor' => (int) ($line['amount_minor'] ?? 0)];
            $bankIndex[$ref]['count']++;
            $bankIndex[$ref]['amount_minor'] = (int) ($line['amount_minor'] ?? 0);
        }

        $batchRef = Reference::generate('REC');
        $matched = 0;
        $exceptions = 0;

        $this->db->beginTransaction();
        try {
            $b = $this->db->prepare(
                'INSERT INTO reconciliation_batches (batch_reference, source, status, period_start, period_end, created_at)
                 VALUES (:ref, :src, :status, NOW(), NOW(), NOW())'
            );
            $b->execute([':ref' => $batchRef, ':src' => $source, ':status' => 'OPEN']);
            $batchId = (int) $this->db->lastInsertId();

            $seenRefs = [];
            foreach ($settlements as $s) {
                $sref     = (string) $s['settlement_reference'];
                $expected = (int) $s['net_minor'];
                $seenRefs[$sref] = true;

                $exceptionType = null;
                $actual = null;
                if (!isset($bankIndex[$sref])) {
                    $exceptionType = 'MISSING_SETTLEMENT';
                } elseif ($bankIndex[$sref]['count'] > 1) {
                    $exceptionType = 'DUPLICATE_SETTLEMENT';
                    $actual = $bankIndex[$sref]['amount_minor'];
                } elseif ($bankIndex[$sref]['amount_minor'] !== $expected) {
                    $exceptionType = 'AMOUNT_MISMATCH';
                    $actual = $bankIndex[$sref]['amount_minor'];
                } else {
                    $actual = $bankIndex[$sref]['amount_minor'];
                }

                $status = $exceptionType === null ? 'MATCHED' : 'EXCEPTION';
                $this->insertItem($batchId, null, (int) $s['id'], (string) $s['provider_reference'], $sref, $expected, $actual, $status, $exceptionType);

                if ($status === 'MATCHED') {
                    $matched++;
                    $this->reconcileSettlement((int) $s['id'], $batchRef);
                } else {
                    $exceptions++;
                    $this->flagSettlementTransactions((int) $s['id']);
                }
            }

            // Bank lines that reference no known settlement → REFERENCE_MISMATCH.
            foreach ($bankIndex as $ref => $info) {
                if (!isset($seenRefs[$ref]) && !$this->settlementExists($ref)) {
                    $exceptions++;
                    $this->insertItem($batchId, null, null, null, $ref, null, (int) $info['amount_minor'], 'EXCEPTION', 'REFERENCE_MISMATCH');
                }
            }

            $total = $matched + $exceptions;
            $u = $this->db->prepare(
                "UPDATE reconciliation_batches
                    SET status = 'COMPLETED', total_items = :t, matched_items = :m, exception_items = :e
                  WHERE id = :id"
            );
            $u->execute([':t' => $total, ':m' => $matched, ':e' => $exceptions, ':id' => $batchId]);

            $this->db->commit();
        } catch (\Throwable $ex) {
            $this->db->rollBack();
            throw $ex;
        }

        Audit::log($actorUserId, 'finance_officer', 'RECONCILIATION_RUN', 'reconciliation_batch', $batchRef, null, [
            'matched' => $matched, 'exceptions' => $exceptions, 'source' => $source,
        ]);

        return [
            'batch_reference' => $batchRef,
            'source'          => $source,
            'matched'         => $matched,
            'exceptions'      => $exceptions,
            'total'           => $matched + $exceptions,
        ];
    }

    /** @return list<array<string,mixed>> */
    public function items(string $batchRef): array
    {
        $stmt = $this->db->prepare(
            'SELECT ri.* FROM reconciliation_items ri
               JOIN reconciliation_batches rb ON rb.id = ri.recon_batch_id
              WHERE rb.batch_reference = :r ORDER BY ri.id'
        );
        $stmt->execute([':r' => $batchRef]);
        return $stmt->fetchAll();
    }

    private function insertItem(int $batchId, ?int $txnId, ?int $settlementId, ?string $providerRef, ?string $bankRef, ?int $expected, ?int $actual, string $status, ?string $exceptionType): void
    {
        $i = $this->db->prepare(
            'INSERT INTO reconciliation_items
                (recon_batch_id, transaction_id, settlement_id, provider_reference, bank_reference,
                 expected_amount_minor, actual_amount_minor, status, exception_type, created_at)
             VALUES (:b, :t, :s, :pref, :bref, :exp, :act, :status, :etype, NOW())'
        );
        $i->execute([
            ':b' => $batchId, ':t' => $txnId, ':s' => $settlementId,
            ':pref' => $providerRef, ':bref' => $bankRef,
            ':exp' => $expected, ':act' => $actual,
            ':status' => $status, ':etype' => $exceptionType,
        ]);
    }

    private function reconcileSettlement(int $settlementId, string $batchRef): void
    {
        $u = $this->db->prepare("UPDATE settlements SET status = 'RECONCILED' WHERE id = :id");
        $u->execute([':id' => $settlementId]);

        $t = $this->db->prepare('SELECT id, status FROM transactions WHERE settlement_id = :sid');
        $t->execute([':sid' => $settlementId]);
        foreach ($t->fetchAll() as $txn) {
            $mark = $this->db->prepare("UPDATE transactions SET reconciliation_status = 'MATCHED' WHERE id = :id");
            $mark->execute([':id' => (int) $txn['id']]);
            $current = TransactionStatus::from((string) $txn['status']);
            if ($current === TransactionStatus::Settled) {
                $this->payments->transition((int) $txn['id'], $current, TransactionStatus::Reconciled, 'RECONCILE', 'reconciliation', 'Matched in batch ' . $batchRef);
            }
        }
    }

    private function flagSettlementTransactions(int $settlementId): void
    {
        $u = $this->db->prepare("UPDATE transactions SET reconciliation_status = 'EXCEPTION' WHERE settlement_id = :sid");
        $u->execute([':sid' => $settlementId]);
    }

    private function settlementExists(string $ref): bool
    {
        $s = $this->db->prepare('SELECT 1 FROM settlements WHERE settlement_reference = :r LIMIT 1');
        $s->execute([':r' => $ref]);
        return $s->fetchColumn() !== false;
    }
}
