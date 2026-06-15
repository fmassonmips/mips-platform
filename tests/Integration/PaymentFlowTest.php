<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Domain\PaymentType;
use App\Services\PaymentService;
use App\Services\ReconciliationService;
use App\Services\SettlementService;
use RuntimeException;

final class PaymentFlowTest extends IntegrationTestCase
{
    public function testPayByBankToReconciledHappyPath(): void
    {
        $m = $this->seedMerchant(approved: true);
        $payments = PaymentService::make();

        // Create (Pay by Bank) — 1.00% fee from the seeded fee_rules.
        $txn = $payments->create([
            'payment_type'       => PaymentType::BankTransfer->value,
            'amount_minor'       => 100000,
            'currency'           => 'MUR',
            'merchant_reference' => $m['merchant_reference'],
        ]);

        self::assertSame('PROCESSING', $txn['status']);
        self::assertSame(1000, (int) $txn['fee_minor']);
        self::assertSame(99000, (int) $txn['net_minor']);
        self::assertSame('passpass', $txn['provider_name']);
        self::assertNotEmpty($txn['regulated_transaction_id']);

        // Confirm (provider webhook) -> PAID.
        $paid = $payments->confirmPaid((string) $txn['transaction_reference']);
        self::assertSame('PAID', $paid['status']);

        // Settle -> SETTLED.
        $summary = SettlementService::make()->settleMerchant($m['merchant_reference']);
        self::assertSame(1, (int) $summary['transaction_count']);
        self::assertSame(99000, (int) $summary['net_minor']);
        self::assertSame('SETTLED', $payments->findByReference((string) $txn['transaction_reference'])['status']);

        // Reconcile (no bank file = happy path) -> RECONCILED.
        $recon = ReconciliationService::make()->run($m['merchant_reference']);
        self::assertSame(1, (int) $recon['matched']);
        self::assertSame(0, (int) $recon['exceptions']);

        $final = $payments->findByReference((string) $txn['transaction_reference']);
        self::assertSame('RECONCILED', $final['status']);
        self::assertSame('MATCHED', $final['reconciliation_status']);
    }

    public function testComplianceGateBlocksUnclearedMerchant(): void
    {
        $m = $this->seedMerchant(approved: false);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/cleared to transact/i');
        PaymentService::make()->create([
            'payment_type'       => PaymentType::BankTransfer->value,
            'amount_minor'       => 5000,
            'merchant_reference' => $m['merchant_reference'],
        ]);
    }

    public function testIdempotencyKeyReturnsSameTransaction(): void
    {
        $m = $this->seedMerchant();
        $payments = PaymentService::make();
        $input = [
            'payment_type'       => PaymentType::BankTransfer->value,
            'amount_minor'       => 2500,
            'merchant_reference' => $m['merchant_reference'],
            'idempotency_key'    => 'IDEM-TEST-1',
        ];
        $first  = $payments->create($input);
        $second = $payments->create($input);
        self::assertSame($first['transaction_reference'], $second['transaction_reference']);
    }

    public function testReconciliationFlagsAmountMismatch(): void
    {
        $m = $this->seedMerchant();
        $payments = PaymentService::make();
        $txn = $payments->create([
            'payment_type'       => PaymentType::BankTransfer->value,
            'amount_minor'       => 50000,
            'merchant_reference' => $m['merchant_reference'],
        ]);
        $payments->confirmPaid((string) $txn['transaction_reference']);
        $summary = SettlementService::make()->settleMerchant($m['merchant_reference']);

        // Bank reports the wrong amount for this settlement.
        $recon = ReconciliationService::make()->run(null, [
            ['reference' => $summary['settlement_reference'], 'amount_minor' => 1],
        ]);
        self::assertSame(0, (int) $recon['matched']);
        self::assertSame(1, (int) $recon['exceptions']);

        $items = ReconciliationService::make()->items((string) $recon['batch_reference']);
        self::assertSame('AMOUNT_MISMATCH', $items[0]['exception_type']);
    }
}
